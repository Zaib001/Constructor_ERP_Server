"use strict";

const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { requestApproval } = require("../approvals/approvals.service");

/**
 * Register PO Status Adapter
 */
/**
 * Register PO Status Adapter
 */
registerAdapter("PO", async ({ docId, status }) => {
    let finalStatus = "draft";
    
    if (status === "in_approval" || status === "submitted") {
        finalStatus = "pending_approval";
    } else if (status === "approved") {
        // Automatically move to 'Issued' after final approval
        finalStatus = "issued";
    } else if (status === "rejected") {
        finalStatus = "rejected";
    } else if (status === "cancelled") {
        finalStatus = "cancelled";
    } else if (status === "sent_back") {
        finalStatus = "sent_back";
    }

    await prisma.purchaseOrder.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });

    // Phase 3: Auto-create Delivery Tracking on Issue
    if (finalStatus === "issued") {
        const po = await prisma.purchaseOrder.findUnique({
            where: { id: docId },
            include: { items: true }
        });

        if (po && po.items.length > 0) {
            // Default expected date to 7 days from now if not specified in PO terms
            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + 7);

            const manpowerKeywords = ["labor", "labour", "manpower", "personnel", "engineer", "supervisor", "operator", "mason", "carpenter", "worker"];
            
            await Promise.all(po.items.map(async item => {
                const isService = item.is_service === true;
                const itemNameLower = (item.item_name || "").toLowerCase();

                if (isService) {
                    let resourceType = "EQUIPMENT"; 
                    if (manpowerKeywords.some(kw => itemNameLower.includes(kw))) {
                        resourceType = "MANPOWER";
                    }

                    return prisma.mobilizationLog.create({
                        data: {
                            company_id: po.company_id,
                            project_id: po.project_id || null,
                            resource_type: resourceType,
                            resource_name: item.item_name,
                            planned_date: expectedDate,
                            status: "pending",
                            remarks: `Automated mobilization for service item from PO ${po.po_number}`
                        }
                    });
                } else {
                    return prisma.deliveryTracking.create({
                        data: {
                            company_id: po.company_id,
                            project_id: po.project_id || null, // Now optional
                            po_id: po.id,
                            item_id: item.item_id,
                            expected_date: expectedDate,
                            status: "pending",
                            remarks: `Automated tracking for PO ${po.po_number}`
                        }
                    });
                }
            }));
        }
    }
});

async function getAllPurchaseOrders(user, page = 1, pageSize = 50, filters = {}) {
    const where = applyDataScope(user, { projectFilter: true });

    if (filters.status) {
        where.status = filters.status;
    }
    if (filters.delivery_status) {
        if (Array.isArray(filters.delivery_status)) {
            where.delivery_status = { in: filters.delivery_status };
        } else {
            where.delivery_status = filters.delivery_status;
        }
    }

    const skip = (page - 1) * pageSize;
    
    return await prisma.purchaseOrder.findMany({
        where,
        skip: isNaN(skip) ? 0 : skip,
        take: isNaN(pageSize) ? 50 : pageSize,
        orderBy: { created_at: "desc" },
        include: {
            company: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
            project: { select: { name: true, code: true } },
            vendor: { select: { name: true } },
            creator: { select: { name: true } }
        }
    });
}

async function getPOById(id, user) {
    const where = applyDataScope(user, { projectFilter: true });
    where.id = id;

    return await prisma.purchaseOrder.findFirst({
        where,
        include: {
            company: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
            project: { select: { name: true, code: true } },
            vendor: { select: { name: true } },
            creator: { select: { name: true } },
            items: true
        }
    });
}

async function createPO(data, user) {
    const { id: actorId, isSuperAdmin, companyId: userCompanyId, roleCode, department_id: actorDeptId } = user;
    const allowed = ["procurement_officer", "erp_admin", "super_admin"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to draft POs.");
    }
    
    const companyId = isSuperAdmin ? (data.company_id || data.companyId || userCompanyId) : userCompanyId;
    if (!companyId) throw new Error("Company context missing for PO creation.");

    const items = data.items || [];
    
    // DEBUG: Inspect incoming items to catch ID loss
    console.log(`[PO-DEBUG] Creating PO with ${items.length} items. Raw items:`, JSON.stringify(items, null, 2));

    const calculatedAmount = items.reduce((acc, item) => {
        const up = Number(item.unitPrice ?? item.unit_price ?? 0);
        const qty = Number(item.quantity ?? 0);
        const lineTotal = up * qty;
        return acc + (!isNaN(lineTotal) ? lineTotal : 0);
    }, 0);

    const amountToUse = calculatedAmount > 0 ? calculatedAmount : (data.amount || 0);

    // Validate Project Assignment if applicable
    if (data.project_id) {
        const project = await prisma.project.findFirst({
            where: {
                ...applyDataScope(user, { projectFilter: true }),
                id: data.project_id
            }
        });
        if (!project) {
            throw new Error("Reference project not found or access denied.");
        }
    }

    if (data.requisition_id) {
        const pr = await prisma.purchaseRequisition.findFirst({
            where: { id: data.requisition_id, company_id: companyId, deleted_at: null }
        });
        if (!pr) throw new Error("Reference Requisition not found or access denied.");
    }

    const po = await prisma.purchaseOrder.create({
        data: {
            po_number: data.po_number || `PO-${Date.now()}`,
            company_id: companyId,
            department_id: data.department_id || actorDeptId,
            project_id: data.project_id || null,
            vendor_id: data.vendor_id,
            requisition_id: data.requisition_id || null,
            rfq_id: data.rfq_id || null,
            quote_id: data.quote_id || null,
            delivery_terms: data.delivery_terms || null,
            payment_terms: data.payment_terms || null,
            subtotal: data.subtotal || 0,
            vat_amount: data.vat_amount || 0,
            total_amount: data.total_amount || amountToUse,
            amount: amountToUse,
            status: "draft",
            created_by: actorId,
            notes: data.notes || null,
            terms_conditions: data.terms_conditions || null,
            items: {
                create: items.map(item => {
                    const up = Number(item.unitPrice ?? item.unit_price ?? 0);
                    const qty = Number(item.quantity ?? 0);
                    const tp = !isNaN(up * qty) ? (up * qty) : 0;
                    return {
                        item_id: item.item_id || item.itemId || null,
                        item_name: item.itemName || item.item_name || "Unspecified Item",
                        description: item.description || null,
                        quantity: qty,
                        unit: item.unit || null,
                        unit_price: up,
                        total_price: tp,
                        is_service: item.isService || false
                    };
                })
            }
        },
        include: {
            items: true
        }
    });

    // Initiate Approval Request
    await requestApproval({
        docType: "PO",
        docId: po.id,
        projectId: po.project_id,
        amount: po.amount,
        remarks: `Purchase Order for ${po.amount} SAR`,
        items: items.map(item => {
            const up = Number(item.unitPrice ?? item.unit_price ?? 0);
            const qty = Number(item.quantity ?? 0);
            return {
                itemName: item.itemName || item.item_name || "Unspecified Item",
                quantity: qty,
                unit: item.unit || null,
                unitPrice: up,
                totalPrice: up * qty
            };
        })
    }, actorId);

    return po;
}

async function issuePO(id, actorId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new Error("PO not found");

    const actor = await prisma.user.findUnique({ where: { id: actorId }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = ["procurement_officer", "erp_admin", "super_admin"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to issue POs.");
    }
    if (po.status !== "approved") {
        // Technically the adapter handles transition to 'issued' on approval, 
        // but if there's a manual step required, this is where it goes.
    }

    return await prisma.purchaseOrder.update({
        where: { id },
        data: { status: "issued", updated_at: new Date() }
    });
}

async function updatePO(id, data, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id, deleted_at: null };
    if (!isSuperAdmin) where.company_id = companyId;

    const po = await prisma.purchaseOrder.findFirst({ where, include: { items: true } });
    if (!po) throw new Error("PO not found or access denied.");

    if (!["draft", "sent_back"].includes(po.status)) {
        throw new Error(`PO cannot be edited while in status: ${po.status}`);
    }

    return await prisma.purchaseOrder.update({
        where: { id },
        data: {
            vendor_id: data.vendor_id ?? po.vendor_id,
            total_amount: data.total_amount ?? po.total_amount,
            delivery_terms: data.delivery_terms ?? po.delivery_terms,
            payment_terms: data.payment_terms ?? po.payment_terms,
            notes: data.notes ?? po.notes,
            terms_conditions: data.terms_conditions ?? po.terms_conditions,
            updated_at: new Date()
        }
    });
}

module.exports = { getAllPurchaseOrders, getPOById, createPO, updatePO, issuePO };
