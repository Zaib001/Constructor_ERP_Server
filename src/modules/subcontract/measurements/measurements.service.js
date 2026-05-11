"use strict";

const prisma = require("../../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../../utils/scoping");
const { logAudit } = require("../../../utils/auditLogger");
const utils = require("../subcontract.utils");

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

// ─── Service Logic ───────────────────────────────────────────────────────────

async function createMeasurement(data, user, ipAddress, deviceInfo) {
    const { 
        workOrderId, workOrderItemId, measurementDate, measuredQty, 
        description, remarks, attachments 
    } = data;

    const { companyId, id: userId } = user;

    // 1. Validate Work Order & Status
    const wo = await prisma.subcontractWorkOrder.findFirst({
        where: { id: workOrderId, company_id: companyId }
    });
    if (!wo) throw new AppError("Work Order not found", 404);
    
    // BUSINESS RULE: Must be mobilized to start measurements
    if (wo.status === "draft" || wo.status === "issued" || wo.status === "in_approval") {
        throw new AppError("Measurements cannot be recorded until Work Order is 'mobilized'", 400);
    }

    const verifiedMob = await prisma.subcontractMobilization.findFirst({
        where: { 
            work_order_id: workOrderId, 
            status: "verified" 
        }
    });
    if (!verifiedMob) {
        throw new AppError("Measurements cannot be recorded until a 'verified' mobilization record exists for this Work Order", 400);
    }

    // 2. Validate Work Order Item
    const woItem = await prisma.subcontractWorkOrderItem.findUnique({
        where: { id: workOrderItemId }
    });
    if (!woItem || woItem.work_order_id !== workOrderId) {
        throw new AppError("Work Order Item not found or mismatch", 404);
    }

    // 3. Validation: Prevent over-measurement using central util
    const previousMeasurements = await prisma.workMeasurement.aggregate({
        where: { 
            work_order_item_id: workOrderItemId, 
            is_latest_revision: true,
            status: { not: "rejected" }
        },
        _sum: { measured_qty: true }
    });
    const cumulativeBefore = previousMeasurements._sum.measured_qty || 0;
    
    try {
        utils.validateMeasurementLimits(woItem.contracted_qty, cumulativeBefore, measuredQty);
    } catch (err) {
        throw new AppError(err.message, 400);
    }

    // 4. Create Measurement
    const count = await prisma.workMeasurement.count({ where: { company_id: companyId } });
    const measurement = await prisma.workMeasurement.create({
        data: {
            company_id: companyId,
            project_id: wo.project_id,
            work_order_id: workOrderId,
            work_order_item_id: workOrderItemId,
            vendor_id: wo.vendor_id,
            wbs_id: wo.wbs_id,
            cost_code_id: wo.cost_code_id,
            measurement_no: utils.generateDocNo("MSR", count),
            measurement_date: new Date(measurementDate),
            description: description || `Measurement for ${woItem.description}`,
            unit: woItem.unit,
            measured_qty: measuredQty,
            rate: woItem.rate,
            amount: Number(measuredQty) * Number(woItem.rate),
            measured_by: userId,
            status: "draft",
            remarks,
            attachments: attachments || null,
            is_latest_revision: true,
            revision_no: 0,
            status_logs: {
                create: {
                    status_from: "none",
                    status_to: "draft",
                    remarks: "Initial recording",
                    created_by: userId
                }
            }
        }
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "work_measurement",
        entityId: measurement.id,
        action: "CREATE_MEASUREMENT",
        afterData: { workOrderId, measuredQty, amount: measurement.amount },
        ipAddress,
        deviceInfo
    });

    return measurement;
}

/**
 * Revision Logic: Clones an existing measurement for correction.
 */
async function createMeasurementRevision(id, user, data) {
    const { companyId, id: userId } = user;
    
    return await prisma.$transaction(async (tx) => {
        const original = await tx.workMeasurement.findUnique({
            where: { id, company_id: companyId }
        });

        if (!original) throw new AppError("Original measurement not found", 404);
        if (original.status !== "rejected" && original.status !== "sent_back") {
            throw new AppError("Only rejected or sent back measurements can be revised", 400);
        }

        // 1. Mark original as not latest
        await tx.workMeasurement.update({
            where: { id },
            data: { is_latest_revision: false }
        });

        // 2. Create new revision
        const revision = await tx.workMeasurement.create({
            data: {
                company_id: original.company_id,
                project_id: original.project_id,
                work_order_id: original.work_order_id,
                work_order_item_id: original.work_order_item_id,
                vendor_id: original.vendor_id,
                wbs_id: original.wbs_id,
                cost_code_id: original.cost_code_id,
                measurement_no: original.measurement_no,
                measurement_date: original.measurement_date,
                description: original.description,
                unit: original.unit,
                measured_qty: data.measuredQty || original.measured_qty,
                rate: original.rate,
                amount: (data.measuredQty || original.measured_qty) * original.rate,
                measured_by: original.measured_by,
                remarks: data.remarks || `Revision of ${original.measurement_no}`,
                revision_no: original.revision_no + 1,
                parent_revision_id: original.id,
                is_latest_revision: true,
                status: "draft",
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

async function getMeasurements(user, filters = {}) {
    const { projectId, workOrderId, status, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });

    if (projectId) where.project_id = projectId;
    if (workOrderId) where.work_order_id = workOrderId;
    if (status) where.status = status;
    where.is_latest_revision = true;

    const [data, total] = await Promise.all([
        prisma.workMeasurement.findMany({
            where,
            include: {
                project: { select: { name: true } },
                work_order: { select: { work_order_no: true, title: true } },
                work_order_item: { select: { description: true, unit: true, contracted_qty: true } },
                measurer: { select: { name: true } }
            },
            orderBy: { created_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.workMeasurement.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getMeasurementById(id, user) {
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });
    where.id = id;

    const measurement = await prisma.workMeasurement.findFirst({
        where,
        include: {
            project: { select: { name: true } },
            work_order: { select: { work_order_no: true, title: true } },
            work_order_item: { select: { description: true, unit: true, contracted_qty: true } },
            measurer: { select: { name: true } },
            checker: { select: { name: true } },
            status_logs: {
                include: { actor: { select: { name: true } } },
                orderBy: { created_at: "desc" }
            }
        }
    });

    if (!measurement) throw new AppError("Measurement not found", 404);
    return measurement;
}

async function updateMeasurementStatus(id, status, user, remarks, ipAddress, deviceInfo) {
    const { companyId, id: userId } = user;
    
    const measurement = await prisma.workMeasurement.findFirst({
        where: { id, company_id: companyId },
        include: { work_order_item: true }
    });

    if (!measurement) throw new AppError("Measurement not found", 404);

    // WORKFLOW VALIDATION
    const validTransitions = {
        'draft': ['submitted', 'cancelled'],
        'submitted': ['checked', 'rejected', 'sent_back'],
        'checked': ['approved', 'certified', 'rejected', 'sent_back'],
        'sent_back': ['submitted', 'cancelled'],
        'approved': ['archived'],
        'certified': ['archived']
    };

    if (validTransitions[measurement.status] && !validTransitions[measurement.status].includes(status)) {
        throw new AppError(`Invalid status transition from ${measurement.status} to ${status}`, 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
        const res = await tx.workMeasurement.update({
            where: { id },
            data: {
                status,
                checked_by: (status === 'checked' || status === 'approved' || status === 'certified') ? userId : measurement.checked_by,
                status_logs: {
                    create: {
                        status_from: measurement.status,
                        status_to: status,
                        remarks: remarks || `Status updated to ${status}`,
                        created_by: userId
                    }
                }
            }
        });

        // If certified/approved, update executed_qty and remaining_qty in WO Item
        if (status === "certified" || status === "approved") {
            const woItem = await tx.subcontractWorkOrderItem.findUnique({ where: { id: measurement.work_order_item_id } });
            const executedQty = Number(woItem.executed_qty) + Number(measurement.measured_qty);
            const remainingQty = Number(woItem.contracted_qty) - executedQty;

            await tx.subcontractWorkOrderItem.update({
                where: { id: measurement.work_order_item_id },
                data: { 
                    executed_qty: executedQty,
                    remaining_qty: remainingQty
                }
            });
        }

        return res;
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "work_measurement",
        entityId: id,
        action: "UPDATE_MEASUREMENT_STATUS",
        afterData: { status },
        ipAddress,
        deviceInfo
    });

    return updated;
}

module.exports = {
    createMeasurement,
    createMeasurementRevision,
    getMeasurements,
    getMeasurementById,
    updateMeasurementStatus
};
