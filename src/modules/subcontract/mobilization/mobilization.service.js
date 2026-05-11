"use strict";

const prisma = require("../../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../../utils/scoping");
const { logAudit } = require("../../../utils/auditLogger");

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

// ─── Service Logic ───────────────────────────────────────────────────────────

async function createMobilization(data, user, ipAddress, deviceInfo) {
    const { 
        workOrderId, mobilizationDate, manpowerCount, 
        equipmentDetails, siteAccessStatus, safetyInductionDone,
        insuranceDocumentsVerified, remarks 
    } = data;

    const { companyId, id: userId } = user;

    const mobilization = await prisma.$transaction(async (tx) => {
        // 1. Validate WO
        const wo = await tx.subcontractWorkOrder.findFirst({
            where: { id: workOrderId, company_id: companyId }
        });
        if (!wo) throw new AppError("Work Order not found", 404);

        // 2. Create Mobilization Record
        const record = await tx.subcontractMobilization.create({
            data: {
                company_id: companyId,
                project_id: wo.project_id,
                work_order_id: workOrderId,
                vendor_id: wo.vendor_id,
                mobilization_date: new Date(mobilizationDate),
                manpower_count: manpowerCount || 0,
                equipment_details: equipmentDetails,
                site_access_status: siteAccessStatus || "pending",
                safety_induction_done: safetyInductionDone || false,
                insurance_documents_verified: insuranceDocumentsVerified || false,
                status: "pending",
                remarks
            }
        });

        // 3. Status remains 'pending' until verified
        
        return record;
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "subcontract_mobilization",
        entityId: mobilization.id,
        action: "CREATE_MOBILIZATION",
        afterData: { workOrderId, mobilizationDate },
        ipAddress,
        deviceInfo
    });

    return mobilization;
}

async function getMobilizations(user, filters = {}) {
    const { projectId, workOrderId, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });

    if (projectId) where.project_id = projectId;
    if (workOrderId) where.work_order_id = workOrderId;

    const [data, total] = await Promise.all([
        prisma.subcontractMobilization.findMany({
            where,
            include: {
                project: { select: { name: true } },
                work_order: { select: { work_order_no: true } },
                vendor: { select: { name: true } }
            },
            orderBy: { created_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.subcontractMobilization.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function verifyMobilization(id, user, ipAddress, deviceInfo) {
    const { companyId, id: userId } = user;

    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch and validate
        const mob = await tx.subcontractMobilization.findFirst({
            where: { id, company_id: companyId }
        });

        if (!mob) throw new AppError("Mobilization record not found", 404);
        if (mob.status === "verified") throw new AppError("Mobilization already verified", 400);

        // 2. Update Mobilization Status
        const updatedMob = await tx.subcontractMobilization.update({
            where: { id },
            data: {
                status: "verified",
                verified_by: userId,
                verified_at: new Date()
            }
        });

        // 3. Update Work Order Status
        await tx.subcontractWorkOrder.update({
            where: { id: mob.work_order_id },
            data: { status: "mobilized" }
        });

        // 4. Log WO Status Change
        await tx.workOrderStatusLog.create({
            data: {
                work_order_id: mob.work_order_id,
                status_from: "issued",
                status_to: "mobilized",
                remarks: "Verified via Mobilization Check",
                created_by: userId
            }
        });

        return updatedMob;
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "subcontract_mobilization",
        entityId: id,
        action: "VERIFY_MOBILIZATION",
        afterData: { status: "verified" },
        ipAddress,
        deviceInfo
    });

    return result;
}

module.exports = {
    createMobilization,
    getMobilizations,
    verifyMobilization
};
