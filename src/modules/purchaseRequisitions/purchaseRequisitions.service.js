"use strict";
const prisma = require("../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../utils/scoping");
const { requestApproval } = require("../approvals/approvals.service");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { sendPushNotification } = require("../../services/notification.service");

registerAdapter("PR", async ({ docId, status }) => {
    let finalStatus = "submitted";
    if (status === "approved") finalStatus = "approved_for_rfq";
    if (status === "rejected") finalStatus = "rejected";
    if (status === "sent_back") finalStatus = "sent_back";
    if (status === "pending") finalStatus = "submitted";

    const updatedPr = await prisma.purchaseRequisition.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });

    try {
        if (updatedPr && updatedPr.requested_by) {
            if (status === "approved" || status === "rejected") {
                const displayStatus = status === "approved" ? "Approved" : "Rejected";
                const type = status === "approved" ? "PR_APPROVED" : "PR_REJECTED";
                await sendPushNotification(updatedPr.requested_by, {
                    title: `PR ${displayStatus}`,
                    body: `Your PR ${updatedPr.pr_no} has been ${displayStatus.toLowerCase()}`,
                    data: { type, refId: updatedPr.id }
                });
            }
        }
    } catch (err) {
        const logger = require("../../logger");
        logger.error("Error sending PR status notification in adapter", err);
    }
});

async function getAllPRs(user, page, pageSize) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: false, projectFilter: true });

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
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: false, projectFilter: true });
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
    await validateResourceAccess(prisma, "project", data.project_id, user, { module: MODULES.PROJECTS, isWrite: false });

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

    try {
        await notifyPRSubmitted(pr, actor.name || "User");
    } catch (err) {
        const logger = require("../../logger");
        logger.error("Error triggering PR submission notifications in createPR", err);
    }

    return pr;
}

async function approvePR(id, data, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true, projectFilter: true });
    where.id = id;

    const pr = await prisma.purchaseRequisition.findFirst({ where });
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

    const updatedPr = await prisma.purchaseRequisition.update({
        where: { id },
        data: { status: finalStatus, updated_at: new Date() }
    });

    try {
        if (updatedPr && updatedPr.requested_by) {
            const displayStatus = data.action === "reject" ? "Rejected" : "Approved";
            const type = data.action === "reject" ? "PR_REJECTED" : "PR_APPROVED";
            await sendPushNotification(updatedPr.requested_by, {
                title: `PR ${displayStatus}`,
                body: `Your PR ${updatedPr.pr_no} has been ${displayStatus.toLowerCase()}`,
                data: { type, refId: updatedPr.id }
            });
        }
    } catch (err) {
        const logger = require("../../logger");
        logger.error("Error sending PR status notification in approvePR", err);
    }

    return updatedPr;
}


async function updatePR(id, data, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true, projectFilter: true });
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
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true, projectFilter: true });
    where.id = id;

    const pr = await prisma.purchaseRequisition.findFirst({ where });
    if (!pr) throw new Error("PR not found or access denied.");
    if (pr.requested_by !== user.id && !["erp_admin", "super_admin"].includes(user.roleCode)) {
        throw new Error("Unauthorized: Only the creator or admin can submit this PR.");
    }
    if (pr.status !== "draft" && pr.status !== "sent_back") {
        throw new Error("Only draft or sent back PRs can be submitted.");
    }

    const updated = await prisma.purchaseRequisition.update({ where: { id }, data: { status: "submitted", updated_at: new Date() } });

    await requestApproval({
        docType: "PR",
        docId: pr.id,
        projectId: pr.project_id,
        amount: 0,
        remarks: pr.reason,
        items: []
    }, user.id);

    try {
        const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
        await notifyPRSubmitted(updated, actor?.name || "User");
    } catch (err) {
        const logger = require("../../logger");
        logger.error("Error sending PR submitted notifications inside submitPR", err);
    }

    return prisma.purchaseRequisition.findUnique({ where: { id } });
}

/**
 * Helper to fetch PMs and Finance users and send PR submission notifications.
 */
async function notifyPRSubmitted(pr, actorName) {
    try {
        // 1. Fetch PMs for this project
        const pmUsers = await prisma.userProject.findMany({
            where: {
                project_id: pr.project_id,
                revoked_at: null,
                OR: [
                    { access_type: "project_manager" },
                    {
                        users: {
                            roles: {
                                code: "project_manager"
                            }
                        }
                    }
                ]
            },
            select: {
                user_id: true
            }
        });
        const pmUserIds = pmUsers.map(pu => pu.user_id).filter(Boolean);

        // 2. Fetch Finance users
        const financeUsers = await prisma.user.findMany({
            where: {
                company_id: pr.company_id,
                is_active: true,
                OR: [
                    {
                        roles: {
                            code: { in: ["accounts_manager", "accounts_officer"] }
                        }
                    },
                    {
                        departments: {
                            code: "DEPT-FIN"
                        }
                    }
                ]
            },
            select: {
                id: true
            }
        });
        const financeUserIds = financeUsers.map(f => f.id);

        // Notify PMs
        for (const pmId of pmUserIds) {
            await sendPushNotification(pmId, {
                title: 'New Purchase Request',
                body: `"${pr.pr_no}" submitted by ${actorName}`,
                data: { type: 'PR_SUBMITTED', refId: pr.id },
            });
        }

        // Notify Finance
        for (const financeId of financeUserIds) {
            await sendPushNotification(financeId, {
                title: 'New Purchase Request',
                body: `"${pr.pr_no}" submitted by ${actorName}`,
                data: { type: 'PR_SUBMITTED', refId: pr.id },
            });
        }
    } catch (err) {
        const logger = require("../../logger");
        logger.error("Error sending PR submitted notifications in helper", err);
    }
}

module.exports = { getAllPRs, getPRById, createPR, updatePR, submitPR, approvePR };

