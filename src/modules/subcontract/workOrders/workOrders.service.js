"use strict";

const prisma = require("../../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../../utils/scoping");
const { logAudit } = require("../../../utils/auditLogger");
const { requestApproval } = require("../../approvals/approvals.service");
const { registerAdapter } = require("../../approvals/approvals.adapter");

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function _generateWorkOrderNo(tx, companyId) {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, "");
    const count = await tx.subcontractWorkOrder.count({ where: { company_id: companyId } });
    return `SWO-${datePart}-${String(count + 1).padStart(4, "0")}`;
}

async function _scopedFind(tx, model, id, companyId, extraWhere = {}) {
    const where = { id, ...extraWhere, company_id: companyId };
    const record = await tx[model].findFirst({ where });
    if (!record) throw new AppError(`${model} not found or access denied`, 404);
    return record;
}

// ─── Service Logic ───────────────────────────────────────────────────────────

async function createWorkOrder(data, user, ipAddress, deviceInfo) {
    const { 
        projectId, vendorId, serviceRequestId, purchaseRequisitionId, 
        purchaseOrderId, title, scopeOfWork, wbsId, costCodeId, 
        contractValue, retentionPercentage, advancePercentage, taxPercentage, 
        taxMode, items 
    } = data;

    const { companyId, id: userId } = user;

    // Validate access to project
    await validateResourceAccess(prisma, "project", projectId, user, { module: MODULES.PROJECTS, isWrite: false });
    
    const wo = await prisma.$transaction(async (tx) => {
        // 1. Generate Number
        const workOrderNo = await _generateWorkOrderNo(tx, companyId);

        // 2. Create Header
        const workOrder = await tx.subcontractWorkOrder.create({
            data: {
                company_id: companyId,
                project_id: projectId,
                vendor_id: vendorId,
                service_request_id: serviceRequestId || null,
                purchase_requisition_id: purchaseRequisitionId || null,
                purchase_order_id: purchaseOrderId || null,
                work_order_no: workOrderNo,
                title,
                scope_of_work: scopeOfWork,
                wbs_id: wbsId,
                cost_code_id: costCodeId,
                contract_value: contractValue,
                retention_percentage: retentionPercentage || 10,
                advance_percentage: advancePercentage || 0,
                tax_percentage: taxPercentage || 0,
                tax_mode: taxMode || "withholding",
                status: "draft",
                created_by: userId,
                status_logs: {
                    create: {
                        status_from: "none",
                        status_to: "draft",
                        remarks: "Initial creation",
                        created_by: userId
                    }
                }
            }
        });

        // 3. Create Items
        if (items && items.length > 0) {
            await tx.subcontractWorkOrderItem.createMany({
                data: items.map(item => ({
                    work_order_id: workOrder.id,
                    description: item.description,
                    contracted_qty: item.contracted_qty,
                    unit: item.unit,
                    rate: item.rate,
                    total_amount: item.totalAmount,
                    remaining_qty: item.contracted_qty,
                    boq_item_id: item.boqItemId || null
                }))
            });
        }

        return workOrder;
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "subcontract_work_order",
        entityId: wo.id,
        action: "CREATE_WORK_ORDER",
        afterData: { workOrderNo: wo.work_order_no, projectId, vendorId },
        ipAddress,
        deviceInfo
    });

    return wo;
}

async function getWorkOrders(user, filters = {}) {
    const { projectId, vendorId, status, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });

    if (projectId) where.project_id = projectId;
    if (vendorId) where.vendor_id = vendorId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
        prisma.subcontractWorkOrder.findMany({
            where,
            include: {
                project: { select: { name: true, code: true } },
                vendor: { select: { name: true, vendor_code: true } },
                wbs: { select: { name: true } },
                cost_code: { select: { category: true } },
                creator: { select: { name: true } }
            },
            orderBy: { created_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.subcontractWorkOrder.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getWorkOrderById(id, user) {
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });
    where.id = id;

    const wo = await prisma.subcontractWorkOrder.findFirst({
        where,
        include: {
            project: { select: { name: true, code: true } },
            vendor: { select: { name: true, vendor_code: true } },
            wbs: { select: { name: true } },
            cost_code: { select: { category: true } },
            creator: { select: { name: true } },
            items: true,
            status_logs: {
                include: { actor: { select: { name: true } } },
                orderBy: { created_at: "desc" }
            },
            service_request: { select: { request_no: true } },
            purchase_requisition: { select: { pr_no: true } },
            purchase_order: { select: { po_number: true } }
        }
    });

    if (!wo) throw new AppError("Work Order not found", 404);
    return wo;
}

async function submitWorkOrder(id, user, ipAddress, deviceInfo) {
    const { companyId, id: userId } = user;
    
    // 1. Fetch and validate
    const wo = await prisma.subcontractWorkOrder.findFirst({
        where: { id, company_id: companyId },
        include: { items: true }
    });

    if (!wo) throw new AppError("Work Order not found", 404);
    if (wo.status !== "draft" && wo.status !== "sent_back") {
        throw new AppError(`Cannot submit Work Order in status: ${wo.status}`, 400);
    }

    // 2. Trigger Approval Engine
    const approvalResult = await requestApproval({
        docType: "SWO",
        docId: wo.id,
        projectId: wo.project_id,
        amount: wo.contract_value,
        items: wo.items.map(i => ({
            itemName: i.description,
            quantity: i.contracted_qty,
            unit: i.unit,
            unitPrice: i.rate,
            totalPrice: i.total_amount
        }))
    }, userId, ipAddress, deviceInfo);

    // 3. Log Status Change
    await prisma.workOrderStatusLog.create({
        data: {
            work_order_id: wo.id,
            status_from: wo.status,
            status_to: "in_approval",
            remarks: "Submitted for approval",
            created_by: userId
        }
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "subcontract_work_order",
        entityId: wo.id,
        action: "SUBMIT_WORK_ORDER",
        afterData: { approvalRequestId: approvalResult.approvalRequestId },
        ipAddress,
        deviceInfo
    });

    return { success: true, approvalResult };
}

async function updateWorkOrder(id, data, user, ipAddress, deviceInfo) {
    const { companyId, id: userId } = user;
    
    const wo = await prisma.subcontractWorkOrder.findFirst({
        where: { id, company_id: companyId }
    });

    if (!wo) throw new AppError("Work Order not found", 404);
    if (wo.status !== "draft" && wo.status !== "sent_back") {
        throw new AppError(`Cannot update Work Order in status: ${wo.status}`, 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
        // Update header
        const result = await tx.subcontractWorkOrder.update({
            where: { id },
            data: {
                title: data.title,
                scope_of_work: data.scopeOfWork,
                wbs_id: data.wbsId,
                cost_code_id: data.costCodeId,
                contract_value: data.contractValue,
                retention_percentage: data.retentionPercentage,
                advance_percentage: data.advancePercentage,
                tax_percentage: data.taxPercentage,
                tax_mode: data.taxMode
            }
        });

        // Update items (simple delete and recreate for now)
        if (data.items) {
            await tx.subcontractWorkOrderItem.deleteMany({ where: { work_order_id: id } });
            await tx.subcontractWorkOrderItem.createMany({
                data: data.items.map(item => ({
                    work_order_id: id,
                    description: item.description,
                    contracted_qty: item.contracted_qty,
                    unit: item.unit,
                    rate: item.rate,
                    total_amount: item.totalAmount,
                    remaining_qty: item.contracted_qty,
                    boq_item_id: item.boqItemId || null
                }))
            });
        }

        return result;
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "subcontract_work_order",
        entityId: id,
        action: "UPDATE_WORK_ORDER",
        afterData: { ...data },
        ipAddress,
        deviceInfo
    });

    return updated;
}

// ─── Register Approval Adapter ───────────────────────────────────────────────

registerAdapter("SWO", async ({ docId, status, userId }) => {
    // Determine mapped status
    let mappedStatus = status;
    if (status === "approved") mappedStatus = "issued";
    if (status === "rejected") mappedStatus = "cancelled";

    const oldWo = await prisma.subcontractWorkOrder.findUnique({ where: { id: docId } });
    
    // WORKFLOW VALIDATION
    const validTransitions = {
        'draft': ['in_approval', 'cancelled'],
        'in_approval': ['issued', 'rejected', 'sent_back'],
        'issued': ['mobilized', 'cancelled'],
        'mobilized': ['in_progress', 'cancelled'],
        'in_progress': ['completed', 'cancelled'],
        'completed': ['closed'],
        'sent_back': ['in_approval', 'cancelled']
    };

    if (validTransitions[oldWo.status] && !validTransitions[oldWo.status].includes(mappedStatus)) {
        console.warn(`[SWO] Invalid transition from ${oldWo.status} to ${mappedStatus}. Force updating via approval engine.`);
    }

    await prisma.$transaction(async (tx) => {
        await tx.subcontractWorkOrder.update({
            where: { id: docId },
            data: { status: mappedStatus }
        });

        await tx.workOrderStatusLog.create({
            data: {
                work_order_id: docId,
                status_from: oldWo.status,
                status_to: mappedStatus,
                remarks: `Status updated via Approval Engine: ${status}`,
                created_by: userId || oldWo.created_by
            }
        });
    });
});

module.exports = {
    createWorkOrder,
    getWorkOrders,
    getWorkOrderById,
    submitWorkOrder,
    updateWorkOrder
};
