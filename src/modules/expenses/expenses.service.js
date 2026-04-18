"use strict";

const prisma = require("../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../utils/scoping");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { requestApproval } = require("../approvals/approvals.service");

/**
 * Register Expense Status Adapter
 */
registerAdapter("EXPENSE", async ({ docId, status }) => {
    let finalStatus = "draft";
    if (status === "in_approval") finalStatus = "pending_approval";
    if (status === "approved") finalStatus = "approved";
    if (status === "rejected") finalStatus = "rejected";
    if (status === "cancelled") finalStatus = "cancelled";
    if (status === "sent_back") finalStatus = "sent_back";

    await prisma.expense.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllExpenses(user, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user, { module: MODULES.FINANCE, isWrite: false });
    
    return await prisma.expense.findMany({
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

async function getExpenseById(id, user) {
    const where = applyDataScope(user, { module: MODULES.FINANCE, isWrite: false });
    where.id = id;

    return await prisma.expense.findFirst({
        where,
        include: {
            company: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
            project: { select: { name: true, code: true } },
            creator: { select: { name: true } }
        }
    });
}

async function createExpense(data, user) {
    const { id: actorId, companyId, isSuperAdmin } = user;
    const targetCompanyId = isSuperAdmin ? (data.companyId || companyId) : companyId;

    // Tenant Security: Verify project belongs to user's company
    if (data.project_id) {
        const project = await prisma.project.findFirst({
            where: { id: data.project_id, company_id: targetCompanyId }
        });
        if (!project) throw new Error("Reference project not found or access denied.");
    }

    const expense = await prisma.expense.create({
        data: {
            expense_number: `EXP-${Date.now()}`,
            company_id: targetCompanyId,
            department_id: data.department_id || null,
            project_id: data.project_id || null,
            amount: data.amount,
            category: data.category || "General",
            description: data.description || null,
            status: "draft",
            created_by: actorId
        }
    });

    // Initiate Approval Request
    await requestApproval({
        docType: "EXPENSE",
        docId: expense.id,
        projectId: expense.project_id,
        amount: expense.amount,
        remarks: `Expense for ${expense.amount} SAR - ${expense.category}`,
        items: [
            {
                itemName: `${expense.category}: ${expense.description || 'Operational Expense'}`,
                quantity: 1,
                unit: "EA",
                unitPrice: expense.amount,
                totalPrice: expense.amount,
                remarks: expense.merchant
            }
        ]
    }, actorId);

    return expense;
}

async function updateExpense(id, data, user) {
    const where = applyDataScope(user, { module: MODULES.FINANCE, isWrite: true });
    where.id = id;

    const expense = await prisma.expense.findFirst({ where });
    if (!expense) throw new Error("Expense not found or access denied.");

    if (!["draft", "sent_back"].includes(expense.status)) {
        throw new Error(`Expense cannot be edited while in status: ${expense.status}`);
    }

    return await prisma.expense.update({
        where: { id },
        data: {
            amount: data.amount ?? expense.amount,
            category: data.category ?? expense.category,
            description: data.description ?? expense.description,
            project_id: data.project_id ?? expense.project_id,
            department_id: data.department_id ?? expense.department_id,
            updated_at: new Date()
        }
    });
}

module.exports = { getAllExpenses, getExpenseById, createExpense, updateExpense };
