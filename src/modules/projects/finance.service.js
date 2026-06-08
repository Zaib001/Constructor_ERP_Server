"use strict";

const prisma = require("../../db");

// Roles allowed to access budget-vs-actual
const ALLOWED_ROLES = new Set([
    "super_admin", "erp_admin",
    "project_manager", "accounts_manager", "accounts_officer",
    "procurement_manager", "hr_manager",
]);

function createAppError(msg, code) {
    const e = new Error(msg);
    e.statusCode = code;
    return e;
}

function computeStatus(actual, budget) {
    if (actual > budget)             return "OVERSPENT";
    if (actual > budget * 0.85)      return "AT_RISK";
    return "ON_TRACK";
}

function pct(actual, budget) {
    if (!budget || budget === 0) return actual > 0 ? 100 : 0;
    return parseFloat(((actual / budget) * 100).toFixed(2));
}

/**
 * Fetch budget-vs-actual per cost code for a given project.
 */
async function getBudgetVsActual(user, { projectId, costCodeFilter, from, to }) {
    // ── Role guard ────────────────────────────────────────────────────────────
    if (!ALLOWED_ROLES.has(user.roleCode)) {
        throw createAppError("Forbidden: Project Manager or above required.", 403);
    }

    // ── Project existence check ───────────────────────────────────────────────
    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            ...(user.isSuperAdmin ? {} : { company_id: user.companyId }),
        },
        select: { id: true, name: true, code: true },
    });
    if (!project) throw createAppError("Project not found.", 404);

    // ── Load cost codes via WBS → project ────────────────────────────────────
    const wbsList = await prisma.wBS.findMany({
        where: { project_id: projectId, deleted_at: null },
        select: { id: true, name: true, wbs_code: true,
            cost_codes: {
                where: { deleted_at: null },
                select: { id: true, category: true, budget_amount: true },
            },
        },
    });

    // Flatten to cost-code rows
    let costCodes = [];
    for (const wbs of wbsList) {
        for (const cc of wbs.cost_codes) {
            const label = `${wbs.wbs_code || "WBS"}-${cc.category.toUpperCase()}`;
            if (costCodeFilter && !label.toLowerCase().includes(costCodeFilter.toLowerCase())) continue;
            costCodes.push({
                id: cc.id,
                costCode: label,
                description: `${wbs.name} (${cc.category})`,
                budgetAmount: Number(cc.budget_amount || 0),
            });
        }
    }

    // Date filter helpers
    const dateFilter = (field) => {
        if (!from && !to) return undefined;
        const f = {};
        if (from) f.gte = from;
        if (to)   f.lte = to;
        return { [field]: f };
    };

    // ── Compute actuals per cost code (batched with Promise.all) ─────────────
    const items = await Promise.all(costCodes.map(async (cc) => {
        // 1. Approved Expenses
        const expenseAgg = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                cost_code_id: cc.id,
                project_id: projectId,
                status: "approved",
                deleted_at: null,
                ...(dateFilter("created_at")),
            },
        });

        // 2. Approved/Issued PO line items
        const poDateFilter = (from || to)
            ? { created_at: { ...(from && { gte: from }), ...(to && { lte: to }) } }
            : {};
        const poAgg = await prisma.purchaseOrderItem.aggregate({
            _sum: { total_price: true },
            where: {
                cost_code_id: cc.id,
                purchase_order: {
                    project_id: projectId,
                    status: { in: ["approved", "issued", "partially_received", "received"] },
                    deleted_at: null,
                    ...poDateFilter,
                },
            },
        });

        // 3. Material issue items (issued = approved for MR)
        const issueAgg = await prisma.materialIssueItem.aggregate({
            _sum: { unit_cost: true },   // proxy: qty * unit_cost per row is unit_cost field
            where: {
                cost_code_id: cc.id,
                issue: {
                    project_id: projectId,
                    deleted_at: null,
                    ...(from || to ? { issued_at: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
                },
            },
        });

        // 4. Approved Payrolls (cost code scoped)
        const payrollAgg = await prisma.payroll.aggregate({
            _sum: { total_amount: true },
            where: {
                cost_code_id: cc.id,
                status: "approved",
                deleted_at: null,
                ...(dateFilter("created_at")),
            },
        });

        const actualSpend =
            Number(expenseAgg._sum.amount   || 0) +
            Number(poAgg._sum.total_price   || 0) +
            Number(issueAgg._sum.unit_cost  || 0) +
            Number(payrollAgg._sum.total_amount || 0);

        const variance = cc.budgetAmount - actualSpend;

        return {
            costCode:        cc.costCode,
            description:     cc.description,
            budgetAmount:    parseFloat(cc.budgetAmount.toFixed(2)),
            actualSpend:     parseFloat(actualSpend.toFixed(2)),
            variance:        parseFloat(variance.toFixed(2)),
            variancePercent: pct(actualSpend, cc.budgetAmount),
            status:          computeStatus(actualSpend, cc.budgetAmount),
        };
    }));

    // ── Summary totals ────────────────────────────────────────────────────────
    const totalBudget  = items.reduce((s, i) => s + i.budgetAmount,  0);
    const totalActual  = items.reduce((s, i) => s + i.actualSpend,   0);
    const totalVariance = totalBudget - totalActual;

    return {
        projectId,
        projectName: project.name,
        currency: "PKR",
        generatedAt: new Date().toISOString(),
        summary: {
            totalBudget:     parseFloat(totalBudget.toFixed(2)),
            totalActual:     parseFloat(totalActual.toFixed(2)),
            totalVariance:   parseFloat(totalVariance.toFixed(2)),
            variancePercent: pct(totalActual, totalBudget),
        },
        items,
    };
}

module.exports = { getBudgetVsActual };
