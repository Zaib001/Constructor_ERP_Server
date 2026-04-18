"use strict";

const prisma = require("../../db");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { requestApproval } = require("../approvals/approvals.service");

/**
 * Register Quotation Status Adapter
 */
registerAdapter("QUOTATION", async ({ docId, status }) => {
    let finalStatus = "draft";
    if (status === "in_approval") finalStatus = "pending_approval";
    if (status === "approved") finalStatus = "approved";
    if (status === "rejected") finalStatus = "rejected";
    if (status === "cancelled") finalStatus = "cancelled";
    if (status === "sent_back") finalStatus = "sent_back";

    await prisma.quotation.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllQuotations(user, page = 1, pageSize = 50) {
    const { companyId, isSuperAdmin } = user;
    if (!isSuperAdmin && !companyId) throw new Error("Tenant context missing");

    const skip = (page - 1) * pageSize;
    const where = { 
        };

    if (!isSuperAdmin) {
        where.company_id = companyId;
    }
    
    return await prisma.quotation.findMany({
        where,
        orderBy: { created_at: "desc" },
        include: {
            company: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
            project: { select: { name: true, code: true } },
            creator: { select: { name: true } }
        }
    });
}

async function getQuotationById(id, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id };
    if (!isSuperAdmin) {
        where.company_id = companyId;
    }

    return await prisma.quotation.findFirst({
        where,
        include: {
            company: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
            project: { select: { name: true, code: true } },
            creator: { select: { name: true } }
        }
    });
}

async function createQuotation(data, user) {
    const { id: actorId, isSuperAdmin, companyId: userCompanyId, departmentId: userDeptId } = user;
    const companyId = isSuperAdmin ? (data.company_id || data.companyId) : userCompanyId;

    if (!companyId) throw new Error("Company context missing for quotation creation.");

    const quote = await prisma.quotation.create({
        data: {
            quote_number: `QTN-${Date.now()}`,
            company_id: companyId,
            department_id: data.department_id || data.departmentId || userDeptId || null,
            project_id: data.project_id || null,
            amount: data.amount,
            status: "draft",
            created_by: actorId
        }
    });

    // Initiate Approval Request
    await requestApproval({
        docType: "QUOTATION",
        docId: quote.id,
        projectId: quote.project_id,
        amount: quote.amount,
        remarks: `Quotation for ${quote.amount} SAR`,
        items: [
            {
                itemName: `Quotation: ${quote.quote_number}`,
                quantity: 1,
                unit: "Lot",
                unitPrice: quote.amount,
                totalPrice: quote.amount
            }
        ]
    }, actorId);

    return quote;
}

async function updateQuotation(id, data, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id };
    if (!isSuperAdmin) where.company_id = companyId;

    const quote = await prisma.quotation.findFirst({ where });
    if (!quote) throw new Error("Quotation not found or access denied.");

    if (!["draft", "sent_back"].includes(quote.status)) {
        throw new Error(`Quotation cannot be edited while in status: ${quote.status}`);
    }

    return await prisma.quotation.update({
        where: { id },
        data: {
            amount: data.amount ?? quote.amount,
            project_id: data.project_id ?? quote.project_id,
            department_id: data.department_id ?? quote.department_id,
            updated_at: new Date()
        }
    });
}

module.exports = { getAllQuotations, getQuotationById, createQuotation, updateQuotation };
