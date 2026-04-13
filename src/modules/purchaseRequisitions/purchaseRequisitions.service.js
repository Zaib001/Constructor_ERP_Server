"use strict";
const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");
const { requestApproval } = require("../approvals/approvals.service");
const { registerAdapter } = require("../approvals/approvals.adapter");

registerAdapter("PR", async ({ docId, status }) => {
    let finalStatus = "submitted";
    if (status === "approved") finalStatus = "approved_for_rfq";
    if (status === "rejected") finalStatus = "rejected";
    if (status === "sent_back") finalStatus = "sent_back";
    if (status === "pending") finalStatus = "submitted";

    await prisma.purchaseRequisition.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllPRs(user, page, pageSize) {
    const where = applyDataScope(user, { projectFilter: true });

    const skip = (page - 1) * pageSize;
    const prs = await prisma.purchaseRequisition.findMany({
        where,
        skip: isNaN(skip) ? 0 : skip,
        take: isNaN(pageSize) ? 50 : pageSize,
        include: { 
            company: { select: { name: true } }, 
            project: { select: { id: true, name: true, code: true } }, 
            requester: { select: { name: true } }, 
            purchaseRequisitionItems: { include: { item: { select: { name: true } } } } 
        },
        orderBy: { created_at: 'desc' }
    });

    return prs.map(pr => ({
        ...pr,
        items: pr.purchaseRequisitionItems
    }));
}

async function getPRById(id, user) {
    const where = applyDataScope(user, { projectFilter: true });
    where.id = id;

    const pr = await prisma.purchaseRequisition.findFirst({
        where,
        include: { 
            company: { select: { name: true } }, 
            project: { select: { id: true, name: true, code: true } }, 
            requester: { select: { name: true } }, 
            purchaseRequisitionItems: { include: { item: { select: { name: true } } } } 
        }
    });

    if (!pr) return null;
    return { ...pr, items: pr.purchaseRequisitionItems };
}

async function createPR(data, user) {
    const actor = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = [
        "site_engineer", 
        "project_manager", 
        "erp_admin", 
        "super_admin",
        "procurement_officer",
        "department_head",
        "site_coordinator"
    ];
    
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to create PRs.");
    }

    if (!data.project_id) throw new Error("Missing project_id in PR payload");
    if (!data.wbs_id) throw new Error("Missing wbs_id in PR payload");
    if (!data.items || !data.items.length) throw new Error("PR must contain at least one item");

    // Validate Project Assignment & Tenant Integrity
    const { validateResourceAccess } = require("../../utils/scoping");
    await validateResourceAccess(prisma, "project", data.project_id, user);

    const project = await prisma.project.findUnique({ where: { id: data.project_id } });
    if (!project) throw new Error(`Reference project record not found for ID: ${data.project_id}`);

    const companyId = user.isSuperAdmin ? (data.company_id || data.companyId) : user.company_id;
    if (!companyId) throw new Error("Company ID is missing from user context/payload.");

    // Get item prices from catalog
    const itemIds = data.items.map(i => i.item_id).filter(id => !!id);
    const catalogItems = itemIds.length > 0 
        ? await prisma.item.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, standard_price: true }
          })
        : [];
    const priceMap = new Map(catalogItems.map(i => [i.id, Number(i.standard_price || 0)]));

    const prItemsData = data.items.map(item => {
        const unitPrice = priceMap.get(item.item_id) || 0;
        const qty = Number(item.quantity) || 0;
        return {
            item_id: item.item_id,
            quantity: qty,
            required_date: item.required_date ? new Date(item.required_date) : null,
            remarks: item.remarks,
            estimated_unit_price: unitPrice,
            estimated_total_price: unitPrice * qty
        };
    });

    const totalEstimatedAmount = prItemsData.reduce((sum, item) => sum + item.estimated_total_price, 0);

            const cid = user.isSuperAdmin ? (data.company_id || data.companyId) : user.company_id;
            if (!cid) throw new Error("Company ID is missing from user session.");

            const pr = await prisma.purchaseRequisition.create({
                data: {
                    pr_no: data.pr_no || `PR-${Date.now()}`,
                    company: { connect: { id: cid } },
            project: data.project_id ? { connect: { id: data.project_id } } : undefined,
            wbs: data.wbs_id ? { connect: { id: data.wbs_id } } : undefined,
            requester: { connect: { id: user.id } },
            reason: data.reason,
            status: "submitted",
            purchaseRequisitionItems: {
                create: prItemsData
            }
        },
        include: { purchaseRequisitionItems: true }
    });

    await requestApproval({
        docType: "PR",
        docId: pr.id,
        projectId: pr.project_id,
        amount: totalEstimatedAmount,
        remarks: pr.reason,
        items: []
    }, user.id);

    return pr;
}

async function approvePR(id, data, user) {
    const pr = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!pr) throw new Error("PR not found");

    const actor = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = ["project_manager", "erp_admin", "super_admin"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to approve PRs.");
    }

    const isAdmin = ["erp_admin", "super_admin"].includes(roleCode);
    
    // Project Scoping
    if (pr.project_id && !isAdmin) {
        const project = await prisma.project.findFirst({ 
            where: { ...applyDataScope(user, { projectFilter: true, projectModel: true }), id: pr.project_id } 
        });
        if (!project) throw new Error("Unauthorized: Access denied to this project's requisitions.");
    }
    
    if (!isAdmin && pr.requested_by === user.id) {
        throw new Error("Self-approval is not allowed.");
    }

    if (data.action === "reject" && !data.remarks) {
        throw new Error("Rejection reason is required.");
    }

    const finalStatus = data.action === "reject" ? "rejected" : "approved_for_rfq";

    return prisma.purchaseRequisition.update({
        where: { id },
        data: { status: finalStatus, updated_at: new Date() }
    });
}


async function updatePR(id, data, user) {
    const where = applyDataScope(user, { projectFilter: true });
    where.id = id;

    const pr = await prisma.purchaseRequisition.findFirst({ where });
    if (!pr) throw new Error("PR not found or access denied.");
    if (pr.requested_by !== user.id && !["erp_admin", "super_admin"].includes(user.roleCode)) {
        throw new Error("Unauthorized: Only the creator or admin can update this PR.");
    }
    if (!["draft", "sent_back"].includes(pr.status)) {
        throw new Error(`PR cannot be edited in status: ${pr.status}`);
    }

    let itemsUpdate = undefined;
    if (data.items && data.items.length > 0) {
        // Recalculate prices
        const itemIds = data.items.map(i => i.item_id);
        const catalogItems = await prisma.item.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, standard_price: true }
        });
        const priceMap = new Map(catalogItems.map(i => [i.id, Number(i.standard_price || 0)]));

        const prItemsData = data.items.map(item => {
            const unitPrice = priceMap.get(item.item_id) || 0;
            const qty = Number(item.quantity) || 0;
            return {
                item_id: item.item_id,
                quantity: qty,
                required_date: item.required_date ? new Date(item.required_date) : null,
                remarks: item.remarks,
                estimated_unit_price: unitPrice,
                estimated_total_price: unitPrice * qty
            };
        });

        itemsUpdate = {
            deleteMany: {},
            create: prItemsData
        };
    }

    return prisma.purchaseRequisition.update({
        where: { id },
        data: {
            reason: data.reason ?? pr.reason,
            wbs_id: data.wbs_id ?? pr.wbs_id,
            ...(itemsUpdate && { purchaseRequisitionItems: itemsUpdate }),
            updated_at: new Date()
        }
    });
}

async function submitPR(id, user) {
    const where = applyDataScope(user, { projectFilter: true });
    where.id = id;

    const pr = await prisma.purchaseRequisition.findFirst({ where });
    if (!pr) throw new Error("PR not found or access denied.");
    if (pr.requested_by !== user.id && !["erp_admin", "super_admin"].includes(user.roleCode)) {
        throw new Error("Unauthorized: Only the creator or admin can submit this PR.");
    }
    if (pr.status !== "draft" && pr.status !== "sent_back") {
        throw new Error("Only draft or sent back PRs can be submitted.");
    }

    await prisma.purchaseRequisition.update({ where: { id }, data: { status: "submitted", updated_at: new Date() } });

    await requestApproval({
        docType: "PR",
        docId: pr.id,
        projectId: pr.project_id,
        amount: 0,
        remarks: pr.reason,
        items: []
    }, user.id);

    return prisma.purchaseRequisition.findUnique({ where: { id } });
}

module.exports = { getAllPRs, getPRById, createPR, updatePR, submitPR, approvePR };

