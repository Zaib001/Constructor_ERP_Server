const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

/**
 * Monitoring Service: The "Strategic Brain" of the ERP
 * Responsible for high-performance KPI aggregation and S-Curve generation.
 */

async function getProjectKPIs(projectId, user) {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            wbs: {
                where: { },
                include: { cost_codes: { where: { } } }
            },
            hindrance_logs: { where: { status: 'open' } }
        }
    });

    if (!project) throw new Error("Project not found");

    // 1. Physical Progress (%)
    // We aggregate root weights and progress
    const rootNodes = project.wbs.filter(w => !w.parent_id);
    let totalProgress = 0;
    const totalWeight = rootNodes.reduce((s, w) => s + Number(w.weightage || 0), 0) || 100;

    rootNodes.forEach(rn => {
        totalProgress += (Number(rn.weightage || 0) * Number(rn.progress_pct || 0)) / 100;
    });

    const completionPct = (totalProgress / totalWeight) * 100;

    // 2. Financial Aggregation (Budget vs Actual)
    let totalBudget = 0;
    let totalActual = 0;

    project.wbs.forEach(node => {
        node.cost_codes.forEach(cc => {
            totalBudget += Number(cc.budget_amount || 0);
            totalActual += Number(cc.actual_amount || 0);
        });
    });

    // 3. Delays & Penalties
    const openHindrances = project.hindrance_logs.length;

    // Estimate Delay Days based on Schedule vs Reality
    // We look for any active WBS that is past its planned_end
    const now = new Date();
    const delayedWBS = project.wbs.filter(w =>
        w.progress_pct < 100 &&
        w.planned_end &&
        new Date(w.planned_end) < now
    );

    let maxDelayDays = 0;
    delayedWBS.forEach(w => {
        const diff = Math.ceil((now - new Date(w.planned_end)) / (1000 * 60 * 60 * 24));
        if (diff > maxDelayDays) maxDelayDays = diff;
    });

    // 4. Committed Cost (Purchase Orders)
    const committedPOs = await prisma.purchaseOrder.findMany({
        where: {
            project_id: projectId,
            status: { in: ['approved', 'issued', 'partially_received', 'received'] }
        },
        select: { total_amount: true }
    });
    const totalCommitted = committedPOs.reduce((s, po) => s + Number(po.total_amount || 0), 0);

    // 5. EVM KPIs (SPI / CPI / EAC / VAC)
    // EV (Earned Value) = TotalBudget * CompletionPct / 100
    const earnedValue = totalBudget * (completionPct / 100);
    const cpi = totalActual > 0 ? earnedValue / totalActual : 1.0;
    
    // EAC = Total Budget / CPI (Assumes current performance continues)
    const eac = cpi > 0 ? totalBudget / cpi : totalBudget;
    const vac = totalBudget - eac;

    return {
        completion_pct: Math.round(completionPct * 10) / 10,
        budget: {
            total: totalBudget,
            actual: totalActual,
            committed: totalCommitted,
            variance: totalBudget - totalActual,
            cpi: Math.round(cpi * 100) / 100,
            eac: Math.round(eac),
            vac: Math.round(vac)
        },
        delays: {
            day_count: maxDelayDays,
            active_hindrances: openHindrances,
            status: maxDelayDays > 0 ? 'DELAYED' : (openHindrances > 0 ? 'AT_RISK' : 'ON_TRACK')
        },
        earned_value: Math.round(earnedValue)
    };
}

async function getProjectSCurve(projectId, user) {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            wbs: { where: { } }
        }
    });

    if (!project) throw new Error("Project not found");

    // Fetch Material Issues and Resource Logs for AC line over time
    const [materialIssues, resourceLogs, pettyCashExc] = await Promise.all([
        prisma.materialIssue.findMany({ 
            where: { project_id: projectId }, 
            include: { items: true } 
        }),
        prisma.resourceLog.findMany({ 
            where: { project_id: projectId, dpr: { status: 'approved' } } 
        }),
        prisma.pettyCashExpense.findMany({
            where: { verification_status: 'verified', request: { project_id: projectId } }
        })
    ]);

    const startDate = project.start_date ? new Date(project.start_date) : new Date(project.created_at);
    const endDate = project.end_date ? new Date(project.end_date) : new Date();
    const now = new Date();

    const weeks = [];
    let current = new Date(startDate);
    while (current <= endDate || current <= now) {
        weeks.push(new Date(current));
        current.setDate(current.getDate() + 7);
    }

    const curveData = weeks.map(week => {
        let pv = 0;
        let ev = 0;
        let ac = 0;

        project.wbs.forEach(w => {
            if (!w.weightage || !w.planned_start || !w.planned_end) return;
            const weight = Number(w.weightage);
            const ps = new Date(w.planned_start);
            const pe = new Date(w.planned_end);

            if (isNaN(ps.getTime()) || isNaN(pe.getTime())) return;

            // PV
            if (week >= pe) pv += weight;
            else if (week >= ps) {
                const totalDays = Math.max(1, (pe.getTime() - ps.getTime()) / (1000 * 60 * 60 * 24));
                const daysPass = Math.max(0, (week.getTime() - ps.getTime()) / (1000 * 60 * 60 * 24));
                pv += weight * (daysPass / totalDays);
            }

            // EV (Current Snapshot Projected to 'now')
            if (week >= now) ev += (weight * Number(w.progress_pct || 0)) / 100;
        });

        // AC Calculation (Aggregating historical costs up to this week)
        materialIssues.forEach(mi => {
            if (new Date(mi.issued_at) <= week) {
                mi.items.forEach(item => ac += Number(item.quantity || 0) * Number(item.unit_cost || 0));
            }
        });
        resourceLogs.forEach(rl => {
            if (new Date(rl.created_at) <= week) ac += Number(rl.labor_cost || 0) + Number(rl.equip_cost || 0);
        });
        pettyCashExc.forEach(pce => {
            if (new Date(pce.created_at) <= week) ac += Number(pce.total_amount || 0);
        });

        return {
            date: week.toISOString().split('T')[0],
            pv: Math.round((pv || 0) * 10) / 10,
            ev: week <= now ? Math.round((ev || 0) * 10) / 10 : null,
            ac: Math.round(ac || 0)
        };
    });

    return curveData;
}

async function getResourceUtilization(projectId, user) {
    // Cross-module join: DPR Items (Qty) vs Resource Logs (Hours)
    const dprItems = await prisma.dPRItem.findMany({
        where: { dpr: { project_id: projectId, status: 'approved' } },
        include: { wbs: true }
    });

    const resourceLogs = await prisma.resourceLog.findMany({
        where: { project_id: projectId, dpr: { status: 'approved' } }
    });

    // Aggregate by WBS
    const metrics = {};
    dprItems.forEach(item => {
        const id = item.wbs_id;
        if (!metrics[id]) {
            metrics[id] = { name: item.wbs?.name, unit: item.unit, actual_qty: 0, hours: 0 };
        }
        metrics[id].actual_qty += Number(item.actual_today_qty);
    });

    resourceLogs.forEach(log => {
        const id = log.wbs_id;
        if (id && metrics[id]) {
            metrics[id].hours += Number(log.hours_worked || log.hours_used || 0);
        }
    });

    return Object.values(metrics).map(m => ({
        ...m,
        productivity: m.hours > 0 ? Math.round((m.actual_qty / m.hours) * 100) / 100 : 0
    })).filter(m => m.actual_qty > 0);
}

async function getResourceTrends(projectId, user) {
    const logs = await prisma.resourceLog.findMany({
        where: { project_id: projectId, dpr: { status: 'approved' } },
        orderBy: { created_at: 'asc' }
    });

    const plans = await prisma.resourcePlan.findMany({
        where: { project_id: projectId }
    });

    // Bucket by week
    const trends = {};
    logs.forEach(log => {
        const week = log.created_at.toISOString().split('T')[0]; // Simple bucket
        if (!trends[week]) trends[week] = { date: week, actual_mh: 0, planned_mh: 0 };
        trends[week].actual_mh += Number(log.hours_worked || log.hours_used || 0);
    });

    // For simplicity, we distribute total plan across project duration
    // In a pro ERP, we'd use the plan_start/plan_end
    return Object.values(trends);
}

module.exports = {
    getProjectKPIs,
    getProjectSCurve,
    getResourceUtilization,
    getResourceTrends
};
