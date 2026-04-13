const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");
const { requestApproval } = require("../approvals/approvals.service");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { updateCostCodeActual, recomputeProjectProgress } = require("../wbs/wbs.service");

registerAdapter("PETTY_CASH", async ({ docId, status }) => {
    let finalStatus = "submitted";
    if (status === "approved") finalStatus = "approved";
    if (status === "rejected") finalStatus = "rejected";
    if (status === "sent_back") finalStatus = "sent_back";

    await prisma.pettyCashRequest.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllRequests(user, page, pageSize) {
    const where = applyDataScope(user, { projectFilter: true });

    const skip = (page - 1) * pageSize;
    return prisma.pettyCashRequest.findMany({
        where, 
        skip: isNaN(skip) ? 0 : skip, 
        take: isNaN(pageSize) ? 50 : pageSize,
        include: { 
            company: { select: { name: true } }, 
            project: { select: { id: true, name: true, code: true } }, 
            requester: { select: { name: true } } 
        },
        orderBy: { created_at: 'desc' }
    });
}

async function getRequestById(id, user) {
    const where = applyDataScope(user, { projectFilter: true });
    where.id = id;

    return prisma.pettyCashRequest.findFirst({
        where,
        include: { 
            company: { select: { name: true } }, 
            project: { select: { id: true, name: true, code: true } }, 
            requester: { select: { name: true } }, 
            expenses: true 
        }
    });
}

async function createRequest(data, user) {
    const actor = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = ["site_engineer", "project_manager", "erp_admin", "super_admin"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to request petty cash.");
    }

    const request = await prisma.$transaction(async (tx) => {
        // Tenant Security: Verify project belongs to user's company and assigned projects
        const scopedProjectWhere = applyDataScope(user, { projectFilter: true, projectModel: true });
        const project = await tx.project.findFirst({
            where: { ...scopedProjectWhere, id: data.project_id }
        });
        if (!project) {
            throw new Error("Reference project not found or access denied.");
        }

        return tx.pettyCashRequest.create({
            data: {
                request_no: data.request_no || `PC-${Date.now()}`,
                company_id: user.isSuperAdmin ? data.company_id : user.companyId,
                project_id: data.project_id,
                wbs_id: data.wbs_id,
                description: data.description,
                estimated_cost: data.estimated_cost,
                emergency_reason: data.emergency_reason,
                requested_by: user.id,
                status: "submitted"
            }
        });
    });

    await requestApproval({
        docType: "PETTY_CASH",
        docId: request.id,
        projectId: request.project_id,
        amount: request.estimated_cost,
        remarks: request.emergency_reason,
        items: []
    }, user.id);

    return request;
}

async function submitExpense(data, user) {
    // VAT math validated: totalAmount = excludingVatAmount + vatAmount
    const excluding = Number(data.excluding_vat_amount) || 0;
    const vat = Number(data.vat_amount) || 0;
    const total = Number(data.total_amount) || 0;
    
    if (Math.abs((excluding + vat) - total) > 0.01) {
        throw new Error("VAT math validation failed: totalAmount must equal excludingVatAmount + vatAmount");
    }

    // Tenant Security: Verify request belongs to user's company
    const prWhere = applyDataScope(user);
    prWhere.id = data.request_id;
    
    const pr = await prisma.pettyCashRequest.findFirst({ where: prWhere });
    if (!pr) throw new Error("Reference Request not found or access denied.");
    
    if (pr.status !== 'approved') {
        throw new Error("Petty cash expense cannot be submitted without approved request");
    }

    return prisma.pettyCashExpense.create({
        data: {
            request_id: data.request_id,
            bill_number: data.bill_number,
            company_name: data.company_name,
            vat_number: data.vat_number,
            excluding_vat_amount: excluding,
            vat_amount: vat,
            total_amount: total,
            purchase_date: data.purchase_date ? new Date(data.purchase_date) : null,
            attachment: data.attachment
        }
    });
}

async function getAllExpenses(user, page, pageSize) {
    const where = applyDataScope(user, { prefix: "request", projectFilter: true });
    
    const skip = (page - 1) * pageSize;
    return prisma.pettyCashExpense.findMany({
        where, 
        skip: isNaN(skip) ? 0 : skip, 
        take: isNaN(pageSize) ? 50 : pageSize,
        include: { request: { include: { project: true, requester: true } } },
        orderBy: { created_at: 'desc' }
    });
}

async function verifyExpense(id, data, user) {
    const actor = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = ["accounts_officer", "erp_admin", "super_admin"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to verify expenses.");
    }

    const curr = await prisma.pettyCashExpense.findUnique({ where: { id } });
    if (!curr) throw new Error("Expense not found");
    if (curr.verification_status !== "pending") {
        throw new Error("Expense is already verified or rejected.");
    }

    if (data.status === "rejected" && !data.remarks) {
        throw new Error("Rejection reason is required.");
    }

    if (curr.request_id) {
        const reqDoc = await prisma.pettyCashRequest.findUnique({ where: { id: curr.request_id }});
        if (reqDoc && reqDoc.requested_by === user.id && !["erp_admin", "super_admin"].includes(roleCode)) {
            throw new Error("Self-verification is not allowed. Please have another accounts officer verify this expense.");
        }
    }

    return await prisma.$transaction(async (tx) => {
        const updated = await tx.pettyCashExpense.update({
            where: { id },
            data: {
                verification_status: data.status, // "verified" or "rejected"
                verified_by_accounts: user.id
            }
        });

        if (data.status === "verified") {
            const reqDoc = await tx.pettyCashRequest.findUnique({ 
                where: { id: curr.request_id },
                select: { wbs_id: true, project_id: true }
            });

            if (reqDoc && reqDoc.wbs_id) {
                // Update CostCode actual (using 'material' or 'other' as category, here we use 'material' as generic site cost if not specific)
                await updateCostCodeActual(tx, reqDoc.wbs_id, 'material', Number(curr.total_amount));
                await recomputeProjectProgress(tx, reqDoc.project_id);
            }
        }

        return updated;
    });
}

async function updateRequest(id, data, user) {
    const where = applyDataScope(user, { projectFilter: true });
    where.id = id;

    const request = await prisma.pettyCashRequest.findFirst({ where });
    if (!request) throw new Error("Petty Cash Request not found or access denied.");

    if (!["submitted", "sent_back"].includes(request.status)) {
        throw new Error(`Request cannot be edited while in status: ${request.status}`);
    }

    return await prisma.pettyCashRequest.update({
        where: { id },
        data: {
            description: data.description ?? request.description,
            estimated_cost: data.estimated_cost ?? request.estimated_cost,
            emergency_reason: data.emergency_reason ?? request.emergency_reason,
            project_id: data.project_id ?? request.project_id,
            wbs_id: data.wbs_id ?? request.wbs_id,
            updated_at: new Date()
        }
    });
}

module.exports = { getAllRequests, getRequestById, createRequest, updateRequest, submitExpense, getAllExpenses, verifyExpense };
