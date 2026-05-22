"use strict";

const db = require("../../db");

// ============================================================
// PROJECT HEALTH REPORT
// ============================================================
async function getProjectHealthReport(companyId, filters = {}) {
    const { project_id } = filters;
    const where = { company_id: companyId };
    if (project_id) where.id = project_id;

    const projects = await db.project.findMany({
        where,
        include: {
            labor_cost_allocations: { select: { allocated_cost: true } },
            purchase_orders: { select: { total_amount: true, status: true } },
            project_profit_snapshots: { orderBy: { created_at: "desc" }, take: 1 }
        }
    });

    return projects.map(p => {
        const totalBudget = Number(p.budget || 0);
        const laborCost = (p.labor_cost_allocations || []).reduce((s, l) => s + Number(l.allocated_cost || 0), 0);
        const procurementCost = (p.purchase_orders || [])
            .filter(po => po.status !== "CANCELLED")
            .reduce((s, po) => s + Number(po.total_amount || 0), 0);
        const totalActual = laborCost + procurementCost;
        const utilization = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
        const margin = p.project_profit_snapshots?.[0] ? Number(p.project_profit_snapshots[0].profit_margin || 0) : null;

        let health = "GREEN";
        if (utilization > 90 || (margin !== null && margin < 5)) health = "RED";
        else if (utilization > 75 || (margin !== null && margin < 15)) health = "YELLOW";

        return {
            project_id: p.id,
            project_name: p.name,
            project_no: p.project_no,
            status: p.status,
            total_budget: Math.round(totalBudget * 100) / 100,
            total_actual: Math.round(totalActual * 100) / 100,
            labor_cost: Math.round(laborCost * 100) / 100,
            procurement_cost: Math.round(procurementCost * 100) / 100,
            budget_utilization_pct: Math.round(utilization * 100) / 100,
            profit_margin_pct: margin,
            health_status: health
        };
    });
}

// ============================================================
// COST OVERRUN REPORT
// ============================================================
async function getCostOverrunReport(companyId, filters = {}) {
    const { project_id } = filters;
    const where = { company_id: companyId };
    if (project_id) where.id = project_id;

    const projects = await db.project.findMany({
        where,
        include: {
            labor_cost_allocations: { select: { allocated_cost: true } },
            purchase_orders: { select: { id: true, po_number: true, total_amount: true, status: true } }
        }
    });

    return projects.map(p => {
        const totalBudget = Number(p.budget || 0);
        const laborCost = (p.labor_cost_allocations || []).reduce((s, l) => s + Number(l.allocated_cost || 0), 0);
        const procurementCost = (p.purchase_orders || [])
            .filter(po => po.status !== "CANCELLED")
            .reduce((s, po) => s + Number(po.total_amount || 0), 0);
        const totalActual = laborCost + procurementCost;
        const overrun = totalActual - totalBudget;
        const overrunPct = totalBudget > 0 ? (overrun / totalBudget) * 100 : 0;

        return {
            project_id: p.id,
            project_name: p.name,
            total_budget: Math.round(totalBudget * 100) / 100,
            total_actual: Math.round(totalActual * 100) / 100,
            overrun_amount: Math.round(overrun * 100) / 100,
            overrun_pct: Math.round(overrunPct * 100) / 100,
            labor_cost: Math.round(laborCost * 100) / 100,
            procurement_cost: Math.round(procurementCost * 100) / 100,
            is_overrun: overrun > 0,
            purchase_orders: (p.purchase_orders || []).map(po => ({
                id: po.id,
                po_number: po.po_number,
                amount: Number(po.total_amount),
                status: po.status
            }))
        };
    });
}

// ============================================================
// PROCUREMENT DELAY REPORT
// ============================================================
async function getProcurementDelayReport(companyId, filters = {}) {
    const { project_id, from_date, to_date } = filters;
    const where = { company_id: companyId, status: { notIn: ["CANCELLED", "DRAFT"] } };
    if (project_id) where.project_id = project_id;
    if (from_date || to_date) {
        where.created_at = {};
        if (from_date) where.created_at.gte = new Date(from_date);
        if (to_date) where.created_at.lte = new Date(to_date);
    }

    const pos = await db.purchaseOrder.findMany({
        where,
        include: {
            vendor: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } }
        },
        orderBy: { created_at: "desc" }
    });

    const now = new Date();
    const items = pos.map(po => {
        const expectedDate = po.expected_delivery_date ? new Date(po.expected_delivery_date) : null;
        const actualDate = po.actual_delivery_date ? new Date(po.actual_delivery_date) : null;
        const referenceDate = actualDate || now;
        const delayDays = expectedDate
            ? Math.max(0, Math.floor((referenceDate - expectedDate) / (1000 * 60 * 60 * 24)))
            : null;

        return {
            po_id: po.id,
            po_number: po.po_number,
            vendor_name: po.vendor?.name || null,
            project_name: po.project?.name || null,
            project_id: po.project_id,
            status: po.status,
            expected_delivery: expectedDate,
            actual_delivery: actualDate,
            delay_days: delayDays,
            is_delayed: delayDays !== null && delayDays > 0,
            amount: Number(po.total_amount)
        };
    });

    const delayedItems = items.filter(d => d.is_delayed);
    const avgDelay = delayedItems.length
        ? delayedItems.reduce((s, d) => s + d.delay_days, 0) / delayedItems.length
        : 0;

    return {
        summary: {
            total_pos: items.length,
            delayed_count: delayedItems.length,
            on_time_count: items.length - delayedItems.length,
            avg_delay_days: Math.round(avgDelay * 10) / 10
        },
        items
    };
}

// ============================================================
// ASSET UTILIZATION REPORT
// ============================================================
async function getAssetUtilizationReport(companyId) {
    const assets = await db.asset.findMany({
        where: { company_id: companyId },
        include: {
            project: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            allocations: { where: { status: "ACTIVE" }, take: 1 }
        }
    });

    const summary = { total: 0, idle: 0, active: 0, disposed: 0, maintenance: 0, book_value_total: 0 };

    const items = assets.map(a => {
        summary.total++;
        summary.book_value_total += Number(a.current_book_value || 0);
        if (a.status === "DISPOSED") summary.disposed++;
        else if (a.status === "UNDER_MAINTENANCE") summary.maintenance++;
        else if (a.allocations.length > 0) summary.active++;
        else summary.idle++;

        return {
            asset_id: a.id,
            asset_code: a.asset_code,
            asset_name: a.asset_name,
            category: a.category,
            status: a.status,
            current_book_value: Number(a.current_book_value),
            accumulated_depreciation: Number(a.accumulated_depreciation),
            allocated_to_project: a.project?.name || null,
            allocated_to_department: a.department?.name || null,
            is_allocated: a.allocations.length > 0
        };
    });

    summary.book_value_total = Math.round(summary.book_value_total * 100) / 100;
    return { summary, items };
}

// ============================================================
// EXECUTIVE KPI DASHBOARD
// ============================================================
async function getExecutiveKPIs(companyId) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [projects, payrollRuns, assets, pos, laborAllocations] = await Promise.all([
        db.project.findMany({
            where: { company_id: companyId },
            include: {
                project_profit_snapshots: { orderBy: { created_at: "desc" }, take: 1 }
            }
        }),
        db.payrollRun.findMany({
            where: { company_id: companyId },
            orderBy: { created_at: "desc" },
            take: 12,
            select: { period_month: true, total_gross: true, total_net: true, total_deduction: true }
        }),
        db.asset.findMany({
            where: { company_id: companyId },
            select: { status: true, current_book_value: true }
        }),
        db.purchaseOrder.findMany({
            where: { company_id: companyId, status: { notIn: ["CANCELLED", "DRAFT"] } },
            select: { total_amount: true, status: true, expected_delivery_date: true, actual_delivery_date: true }
        }),
        db.laborCostAllocation.findMany({
            where: { company_id: companyId },
            select: { allocated_cost: true }
        })
    ]);

    const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
    const totalLaborCost = laborAllocations.reduce((s, l) => s + Number(l.allocated_cost || 0), 0);

    const payrollTrend = payrollRuns.slice(0, 6).map(r => ({
        period: r.period_month,
        gross: Number(r.total_gross || 0),
        net: Number(r.total_net || 0)
    }));

    const margins = projects
        .map(p => Number(p.project_profit_snapshots?.[0]?.profit_margin || 0))
        .filter(m => m !== 0);
    const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;

    const activeAssets = assets.filter(a => a.status === "ACTIVE").length;
    const idleAssets = assets.filter(a => !["DISPOSED", "ACTIVE", "UNDER_MAINTENANCE"].includes(a.status)).length;
    const totalAssetValue = assets.reduce((s, a) => s + Number(a.current_book_value || 0), 0);

    const delayedPOs = pos.filter(po => {
        if (!po.expected_delivery_date) return false;
        const ref = po.actual_delivery_date ? new Date(po.actual_delivery_date) : now;
        return ref > new Date(po.expected_delivery_date);
    }).length;

    return {
        generated_at: new Date(),
        period: currentMonth,
        financial: {
            total_budget: Math.round(totalBudget * 100) / 100,
            total_labor_cost: Math.round(totalLaborCost * 100) / 100,
            avg_project_margin_pct: Math.round(avgMargin * 100) / 100
        },
        payroll: {
            current_month: currentMonth,
            trend: payrollTrend
        },
        assets: {
            total_count: assets.length,
            active_count: activeAssets,
            idle_count: idleAssets,
            total_book_value: Math.round(totalAssetValue * 100) / 100
        },
        procurement: {
            total_pos: pos.length,
            delayed_count: delayedPOs,
            on_time_count: pos.length - delayedPOs
        },
        projects: {
            total: projects.length,
            active: projects.filter(p => p.status === "ACTIVE").length,
            completed: projects.filter(p => p.status === "COMPLETED").length
        }
    };
}

module.exports = {
    getProjectHealthReport,
    getCostOverrunReport,
    getProcurementDelayReport,
    getAssetUtilizationReport,
    getExecutiveKPIs
};
