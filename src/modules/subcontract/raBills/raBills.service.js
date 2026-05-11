"use strict";

const prisma = require("../../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../../utils/scoping");
const { logAudit } = require("../../../utils/auditLogger");
const { requestApproval } = require("../../approvals/approvals.service");
const { registerAdapter } = require("../../approvals/approvals.adapter");
const utils = require("../subcontract.utils");

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

// ─── Service Logic ───────────────────────────────────────────────────────────

async function getPendingMeasurements(workOrderId, user) {
    const { companyId } = user;
    
    // Find certified measurements for this WO that are NOT yet billed
    const measurements = await prisma.workMeasurement.findMany({
        where: {
            work_order_id: workOrderId,
            company_id: companyId,
            status: "certified",
            is_latest_revision: true,
            ra_bill_items: {
                none: {
                    ra_bill: {
                        status: { notIn: ["cancelled", "rejected"] }
                    }
                }
            }
        },
        include: {
            work_order_item: true
        }
    });

    return measurements;
}

async function createRaBill(data, user, ipAddress, deviceInfo) {
    const { 
        workOrderId, billDate, periodStart, periodEnd, 
        remarks, measurementIds 
    } = data;

    const { companyId, id: userId } = user;

    const bill = await prisma.$transaction(async (tx) => {
        // 1. Validate WO
        const wo = await tx.subcontractWorkOrder.findFirst({
            where: { id: workOrderId, company_id: companyId }
        });
        if (!wo) throw new AppError("Work Order not found", 404);

        const measurements = await tx.workMeasurement.findMany({
            where: {
                id: { in: measurementIds },
                work_order_id: workOrderId,
                status: "certified",
                ra_bill_items: { 
                    none: {
                        ra_bill: {
                            status: { notIn: ["cancelled", "rejected"] }
                        }
                    }
                }
            }
        });

        if (measurements.length !== measurementIds.length) {
            throw new AppError("One or more selected measurements are already billed or invalid", 400);
        }

        // 3. Calculate Bill Items and Gross
        let grossAmount = 0;
        const billItemsData = [];

        for (const m of measurements) {
            grossAmount += Number(m.amount);
            billItemsData.push({
                measurement_id: m.id,
                amount: m.amount
            });
        }

        // 4. Financial Calculations using central util
        const finance = utils.calculateNetPayable({
            grossAmount,
            retentionPct: wo.retention_percentage,
            taxPct: wo.tax_percentage,
            taxMode: wo.tax_mode,
            advanceRecovery: data.advanceRecovery,
            deductions: data.deductions
        });

        // 5. Create RA Bill Header
        const count = await tx.rABill.count({ where: { company_id: companyId } });
        const raBillNo = utils.generateDocNo("RAB", count);

        const raBill = await tx.rABill.create({
            data: {
                company_id: companyId,
                project_id: wo.project_id,
                work_order_id: workOrderId,
                vendor_id: wo.vendor_id,
                ra_bill_no: raBillNo,
                bill_date: new Date(billDate),
                billing_period_start: new Date(periodStart),
                billing_period_end: new Date(periodEnd),
                gross_amount: finance.grossAmount,
                retention_amount: finance.retentionAmount,
                advance_recovery: data.advanceRecovery || 0,
                tax_amount: finance.taxAmount,
                deductions: data.deductions || 0,
                net_payable: finance.netPayable,
                status: "draft",
                remarks,
                revision_no: 0,
                is_latest_revision: true,
                status_logs: {
                    create: {
                        status_from: "none",
                        status_to: "draft",
                        remarks: "Initial bill generation",
                        created_by: userId
                    }
                }
            }
        });

        // 6. Create Bill Items
        await tx.rABillItem.createMany({
            data: billItemsData.map(item => ({
                ra_bill_id: raBill.id,
                measurement_id: item.measurement_id,
                amount: item.amount
            }))
        });

        return raBill;
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "ra_bill",
        entityId: bill.id,
        action: "CREATE_RA_BILL",
        afterData: { raBillNo: bill.ra_bill_no, workOrderId, netPayable: bill.net_payable },
        ipAddress,
        deviceInfo
    });

    return bill;
}

/**
 * Revision Logic: Clones an existing RA Bill for correction.
 */
async function createRaBillRevision(id, user, data) {
    const { companyId, id: userId } = user;
    
    return await prisma.$transaction(async (tx) => {
        const original = await tx.rABill.findUnique({
            where: { id, company_id: companyId },
            include: { items: true }
        });

        if (!original) throw new AppError("Original bill not found", 404);
        if (original.status !== "rejected" && original.status !== "sent_back") {
            throw new AppError("Only rejected or sent back bills can be revised", 400);
        }

        // 1. Archive previous revision
        await tx.rABill.update({
            where: { id },
            data: { is_latest_revision: false }
        });

        // 2. Create new revision
        const revision = await tx.rABill.create({
            data: {
                company_id: original.company_id,
                project_id: original.project_id,
                work_order_id: original.work_order_id,
                vendor_id: original.vendor_id,
                ra_bill_no: original.ra_bill_no,
                bill_date: original.bill_date,
                billing_period_start: original.billing_period_start,
                billing_period_end: original.billing_period_end,
                gross_amount: original.gross_amount,
                retention_amount: original.retention_amount,
                advance_recovery: original.advance_recovery,
                tax_amount: original.tax_amount,
                deductions: original.deductions,
                net_payable: original.net_payable,
                remarks: data.remarks || `Revision of ${original.ra_bill_no}`,
                status: "draft",
                revision_no: original.revision_no + 1,
                parent_revision_id: original.id,
                is_latest_revision: true,
                items: {
                    create: original.items.map(item => ({
                        measurement_id: item.measurement_id,
                        amount: item.amount
                    }))
                },
                status_logs: {
                    create: {
                        status_from: original.status,
                        status_to: "draft",
                        remarks: `Revision #${original.revision_no + 1} created`,
                        created_by: userId
                    }
                }
            }
        });

        return revision;
    });
}

async function submitRaBill(id, user, ipAddress, deviceInfo) {
    const { companyId, id: userId } = user;
    
    const bill = await prisma.rABill.findFirst({
        where: { id, company_id: companyId }
    });

    if (!bill) throw new AppError("RA Bill not found", 404);
    if (bill.status !== "draft" && bill.status !== "sent_back") {
        throw new AppError(`Cannot submit RA Bill in status: ${bill.status}`, 400);
    }

    // Trigger Approval Engine (SRB)
    const approvalResult = await requestApproval({
        docType: "SRB",
        docId: bill.id,
        projectId: bill.project_id,
        amount: bill.net_payable,
        remarks: `RA Bill ${bill.ra_bill_no} for net payable ${bill.net_payable}`
    }, userId, ipAddress, deviceInfo);

    await prisma.rABillStatusLog.create({
        data: {
            ra_bill_id: bill.id,
            status_from: bill.status,
            status_to: "in_approval",
            remarks: "Submitted for finance approval",
            created_by: userId
        }
    });

    return { success: true, approvalResult };
}

async function getRaBills(user, filters = {}) {
    const { projectId, workOrderId, status, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });

    if (projectId) where.project_id = projectId;
    if (workOrderId) where.work_order_id = workOrderId;
    if (status) where.status = status;
    where.is_latest_revision = true;

    const [data, total] = await Promise.all([
        prisma.rABill.findMany({
            where,
            include: {
                project: { select: { name: true } },
                work_order: { select: { work_order_no: true } },
                vendor: { select: { name: true } },
                status_logs: {
                    include: { actor: { select: { name: true } } },
                    orderBy: { created_at: "desc" },
                    take: 1
                }
            },
            orderBy: { created_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.rABill.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getRaBillById(id, user) {
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });
    where.id = id;

    const bill = await prisma.rABill.findFirst({
        where,
        include: {
            project: { select: { name: true } },
            work_order: { select: { work_order_no: true, title: true } },
            vendor: { select: { name: true, vendor_code: true } },
            items: {
                include: {
                    measurement: {
                        include: { work_order_item: true }
                    }
                }
            },
            status_logs: {
                include: { actor: { select: { name: true } } },
                orderBy: { created_at: "desc" }
            }
        }
    });

    if (!bill) throw new AppError("RA Bill not found", 404);
    return bill;
}

// ─── Register Approval Adapter ───────────────────────────────────────────────

registerAdapter("SRB", async ({ docId, status, userId }) => {
    let mappedStatus = status;
    if (status === "approved") mappedStatus = "certified"; 
    if (status === "rejected") mappedStatus = "cancelled";

    const oldBill = await prisma.rABill.findUnique({ where: { id: docId } });
    
    // WORKFLOW VALIDATION
    const validTransitions = {
        'draft': ['in_approval', 'cancelled'],
        'in_approval': ['certified', 'rejected', 'sent_back'],
        'certified': ['partially_paid', 'paid', 'archived'],
        'partially_paid': ['paid', 'archived'],
        'sent_back': ['in_approval', 'cancelled'],
        'rejected': ['archived'],
        'paid': ['archived']
    };

    if (validTransitions[oldBill.status] && !validTransitions[oldBill.status].includes(mappedStatus)) {
        console.warn(`[SRB] Invalid transition from ${oldBill.status} to ${mappedStatus}. Force updating via approval engine.`);
    }

    await prisma.$transaction(async (tx) => {
        await tx.rABill.update({
            where: { id: docId },
            data: { status: mappedStatus }
        });

        await tx.rABillStatusLog.create({
            data: {
                ra_bill_id: docId,
                status_from: oldBill.status,
                status_to: mappedStatus,
                remarks: `Status updated via Approval Engine: ${status}`,
                created_by: userId || oldBill.created_by
            }
        });
    });
});

module.exports = {
    getPendingMeasurements,
    createRaBill,
    createRaBillRevision,
    submitRaBill,
    getRaBills,
    getRaBillById
};
