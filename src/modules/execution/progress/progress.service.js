const prisma = require('../../../db');
const { Prisma } = require('@prisma/client');

/**
 * Full project progress summary with SPI, CPI, planned vs actual.
 * Formula:
 *   - WBS leaf progress_pct = actual_qty / planned_qty * 100
 *   - WBS parent progress_pct = Σ(child.progress_pct * child.weight_pct) / Σ(child.weight_pct)
 *   - Project progress_pct = Σ(root.progress_pct * root.weight_pct) / Σ(root.weight_pct)
 *   - EV = BOQ total * progress_pct/100
 *   - PV = BOQ total * planned_pct_to_date/100
 *   - AC = Σ CostCode.actual_amount across all categories
 *   - SPI = EV / PV
 *   - CPI = EV / AC
 *   - FAC = AC + ((1 - progress_pct/100) * remaining_budget)
 *   - VAC = budget - FAC
 */
async function getProjectProgress(project_id, company_id) {
  const project = await prisma.project.findFirst({
    where: { id: project_id, company_id, deleted_at: null },
    include: {
      wbs: {
        where: { deleted_at: null },
        include: {
          cost_codes: true,
          boq_items: true,
          children: {
            where: { deleted_at: null },
            include: { cost_codes: true, boq_items: true }
          }
        }
      }
    }
  });
  if (!project) throw new Error('Project not found');

  // BOQ totals
  const allBOQ = await prisma.bOQItem.findMany({ where: { project_id, company_id } });
  const boq_total = allBOQ.reduce((s, b) => s + Number(b.total_amount), 0);

  // Actual cost from all cost codes
  const costCodes = await prisma.costCode.findMany({
    where: { wbs: { project_id } }
  });
  const actual_cost = costCodes.reduce((s, cc) => s + Number(cc.actual_amount || 0), 0);
  const planned_budget = costCodes.reduce((s, cc) => s + Number(cc.budget_amount || 0), 0);

  // WBS tree with progress
  const rootWBS = project.wbs.filter(w => !w.parent_id);
  const totalWeight = rootWBS.reduce((s, w) => s + Number(w.weight_pct || 0), 0);

  let project_progress_pct = 0;
  if (totalWeight > 0) {
    project_progress_pct = rootWBS.reduce((s, w) => s + (Number(w.progress_pct || 0) * Number(w.weight_pct || 0)), 0) / totalWeight;
  } else if (rootWBS.length > 0) {
    project_progress_pct = rootWBS.reduce((s, w) => s + Number(w.progress_pct || 0), 0) / rootWBS.length;
  }

  // Schedule: build planned_pct based on elapsed days vs total duration
  let planned_pct = 0;
  if (project.start_date && project.end_date) {
    const total_days = (new Date(project.end_date) - new Date(project.start_date)) / 86400000;
    const elapsed_days = Math.max(0, (new Date() - new Date(project.start_date)) / 86400000);
    planned_pct = total_days > 0 ? Math.min(100, (elapsed_days / total_days) * 100) : 0;
  }

  // EV, PV, AC
  const earned_value  = boq_total * (project_progress_pct / 100);
  const planned_value = boq_total * (planned_pct / 100);
  const SPI = planned_value > 0 ? earned_value / planned_value : 1;
  const CPI = actual_cost  > 0 ? earned_value / actual_cost  : 1;

  // Forecast
  const remaining_budget = planned_budget - actual_cost;
  const remaining_work_pct = Math.max(0, 1 - project_progress_pct / 100);
  const FAC = actual_cost + (remaining_work_pct * (planned_budget > 0 ? planned_budget : boq_total));
  const VAC = (planned_budget > 0 ? planned_budget : boq_total) - FAC;

  // DPR history for S-curve (last 90 days)
  const dprHistory = await prisma.dPR.findMany({
    where: { project_id, company_id, deleted_at: null, status: { in: ['approved', 'submitted'] } },
    orderBy: { report_date: 'asc' },
    select: { report_date: true, items: { select: { actual_today_qty: true, cumulative_actual: true, progress_pct: true } } }
  });

  // Resource summary (last 30 days)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const resourceSummary = await prisma.resourceLog.groupBy({
    by: ['resource_type'],
    where: { project_id, company_id, created_at: { gte: cutoff } },
    _sum: { labor_cost: true, equip_cost: true, headcount: true, hours_worked: true }
  });

  // Hindrance summary
  const hindranceSummary = await prisma.hindranceLog.groupBy({
    by: ['category', 'status'],
    where: { project_id, company_id }
  });

  return {
    project: { id: project.id, name: project.name, code: project.code, status: project.status, start_date: project.start_date, end_date: project.end_date },
    progress: {
      project_progress_pct: Number(project_progress_pct.toFixed(2)),
      planned_pct: Number(planned_pct.toFixed(2)),
      schedule_status: SPI >= 1 ? 'Ahead' : SPI >= 0.9 ? 'On Track' : 'Behind',
      cost_status: CPI >= 1 ? 'Under Budget' : CPI >= 0.9 ? 'On Budget' : 'Over Budget',
    },
    financials: {
      boq_total: Number(boq_total.toFixed(2)),
      planned_budget: Number(planned_budget.toFixed(2)),
      actual_cost: Number(actual_cost.toFixed(2)),
      earned_value: Number(earned_value.toFixed(2)),
      planned_value: Number(planned_value.toFixed(2)),
      SPI: Number(SPI.toFixed(3)),
      CPI: Number(CPI.toFixed(3)),
      FAC: Number(FAC.toFixed(2)),
      VAC: Number(VAC.toFixed(2)),
      cost_variance: Number((planned_budget - actual_cost).toFixed(2)),
      budget_utilization_pct: planned_budget > 0 ? Number(((actual_cost / planned_budget) * 100).toFixed(2)) : 0,
    },
    wbs_progress: rootWBS.map(w => ({
      id: w.id, name: w.name, wbs_code: w.wbs_code,
      planned_qty: w.planned_qty, actual_qty: w.actual_qty, unit: w.unit,
      progress_pct: Number(w.progress_pct || 0),
      weight_pct: Number(w.weight_pct || 0),
      planned_cost: Number(w.planned_cost || 0),
      boq_amount: w.boq_items.reduce((s, b) => s + Number(b.total_amount), 0),
      actual_cost: w.cost_codes.reduce((s, cc) => s + Number(cc.actual_amount || 0), 0),
    })),
    dpr_history: dprHistory.map(d => ({
      date: d.report_date,
      avg_progress: d.items.length > 0
        ? d.items.reduce((s, i) => s + Number(i.progress_pct), 0) / d.items.length
        : 0
    })),
    resource_summary: resourceSummary,
    hindrance_summary: hindranceSummary,
  };
}

async function getWBSProgress(project_id, company_id) {
  const wbsItems = await prisma.wBS.findMany({
    where: { project_id, deleted_at: null },
    include: {
      cost_codes: true,
      boq_items: true,
      dpr_items: { orderBy: { dpr: { report_date: 'desc' } }, take: 1 }
    },
    orderBy: { wbs_code: 'asc' }
  });

  return wbsItems.map(w => ({
    id: w.id, parent_id: w.parent_id, name: w.name, wbs_code: w.wbs_code,
    unit: w.unit, planned_qty: w.planned_qty, actual_qty: w.actual_qty,
    progress_pct: Number(w.progress_pct || 0), weight_pct: Number(w.weight_pct || 0),
    planned_start: w.planned_start, planned_end: w.planned_end,
    actual_start: w.actual_start, actual_end: w.actual_end,
    planned_cost: Number(w.planned_cost || 0),
    budget_amount: w.cost_codes.reduce((s, cc) => s + Number(cc.budget_amount || 0), 0),
    actual_cost: w.cost_codes.reduce((s, cc) => s + Number(cc.actual_amount || 0), 0),
    boq_amount: w.boq_items.reduce((s, b) => s + Number(b.total_amount), 0),
    last_dpr_date: w.dpr_items[0]?.dpr?.report_date || null,
  }));
}

module.exports = { getProjectProgress, getWBSProgress };
