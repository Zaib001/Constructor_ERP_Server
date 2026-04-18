"use strict";
const prisma = require("../../db");
const { applyDataScope, MODULES } = require("../../utils/scoping");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { requestApproval } = require("../approvals/approvals.service");

/**
 * Register Vendor Status Adapter
 * When a VENDOR approval request is approved, this will mark the vendor as 'active'.
 */
registerAdapter("VENDOR", async ({ docId, status }) => {
    let finalStatus = "pending";
    if (status === "approved") finalStatus = "active";
    if (status === "rejected") finalStatus = "rejected";
    if (status === "cancelled") finalStatus = "cancelled";
    if (status === "sent_back") finalStatus = "sent_back";

    await prisma.vendor.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllVendors(user, page = 1, pageSize = 50) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: false });

    const skip = (page - 1) * pageSize;
    
    const [data, total] = await Promise.all([
        prisma.vendor.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
            include: {
                company: { select: { name: true, code: true } },
                creator: { select: { name: true } }
            }
        }),
        prisma.vendor.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getVendorById(id, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: false });
    where.id = id;

    return await prisma.vendor.findFirst({
        where,
        include: {
            company: { select: { name: true, code: true } },
            creator: { select: { name: true } },
            purchase_orders: {
                where: { },
                take: 10,
                orderBy: { created_at: "desc" }
            }
        }
    });
}

async function createVendor(data, user) {
    const { id: actorId, isSuperAdmin, companyId: userCompanyId } = user;
    const companyId = isSuperAdmin ? (data.company_id || data.companyId) : userCompanyId;

    if (!companyId) throw new Error("Company context missing for vendor creation.");

    // 1. Validate Required Fields
    if (!data.name) throw new Error("Missing required fields: Vendor name is mandatory.");

    // 2. Prevent duplicate registration within the same company
    const existing = await prisma.vendor.findFirst({
        where: {
            name: { equals: data.name, mode: "insensitive" },
            company_id: companyId
        }
    });
    if (existing) {
        throw new Error(`Duplicate Entry: Vendor '${data.name}' already exists in this company.`);
    }

    // 3. Perform atomic creation and approval trigger
    return await prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.create({
            data: {
                name: data.name,
                email: data.email || null,
                phone: data.phone || null,
                contact_person: data.contact_person || null,
                address: data.address || null,
                tax_id: data.tax_id || null,
                services: data.services || null,
                category: data.category || null,
                rating: data.rating || null,
                bank_details: data.bank_details || null,
                attachments: data.attachments || null,
                company_id: companyId,
                department_id: data.department_id || null,
                created_by: actorId,
                status: "pending"
            }
        });

        // Trigger Approval Workflow (Transactional ensure)
        await requestApproval({
            docType: "VENDOR",
            docId: vendor.id,
            amount: 0,
            remarks: `New vendor registration request for '${vendor.name}'`
        }, actorId);

        return vendor;
    });
}

async function updateVendor(id, data, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true });
    where.id = id;

    const vendor = await prisma.vendor.findFirst({ where });
    if (!vendor) throw new Error("Vendor not found or access denied.");
    if (!["pending", "sent_back"].includes(vendor.status)) {
        throw new Error(`Vendor cannot be edited while in status: ${vendor.status}`);
    }

    return await prisma.vendor.update({
        where: { id },
        data: {
            name: data.name ?? vendor.name,
            email: data.email ?? vendor.email,
            phone: data.phone ?? vendor.phone,
            contact_person: data.contact_person ?? vendor.contact_person,
            address: data.address ?? vendor.address,
            tax_id: data.tax_id ?? vendor.tax_id,
            services: data.services ?? vendor.services,
            category: data.category ?? vendor.category,
            rating: data.rating ?? vendor.rating,
            bank_details: data.bank_details ?? vendor.bank_details,
            attachments: data.attachments ?? vendor.attachments,
            updated_at: new Date()
        }
    });
}

async function suspendVendor(id, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true });
    where.id = id;

    const vendor = await prisma.vendor.findFirst({ where });
    if (!vendor) throw new Error("Vendor not found or access denied.");

    return await prisma.vendor.update({
        where: { id },
        data: {
            status: "suspended",
            updated_at: new Date()
        }
    });
}

async function deactivateVendor(id, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true });
    where.id = id;

    const vendor = await prisma.vendor.findFirst({ where });
    if (!vendor) throw new Error("Vendor not found or access denied.");

    return await prisma.vendor.update({
        where: { id },
        data: {
            status: "deactivated",
            updated_at: new Date()
        }
    });
}

async function deleteVendor(id, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true });
    where.id = id;

    const vendor = await prisma.vendor.findFirst({ where });
    if (!vendor) throw new Error("Vendor not found or access denied.");

    return await prisma.vendor.update({
        where: { id },
        data: { 
            status: "deleted", 
            deleted_at: new Date() 
        }
    });
}

async function approveVendor(id, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true });
    where.id = id;

    const vendor = await prisma.vendor.findFirst({ where });
    if (!vendor) throw new Error("Vendor not found or access denied.");

    return await prisma.vendor.update({
        where: { id },
        data: { status: "active", updated_at: new Date() }
    });
}

module.exports = { 
    getAllVendors, 
    getVendorById, 
    createVendor, 
    updateVendor, 
    deleteVendor, 
    suspendVendor, 
    deactivateVendor,
    approveVendor
};
