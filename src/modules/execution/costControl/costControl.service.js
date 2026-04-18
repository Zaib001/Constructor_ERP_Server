const prisma = require('../../../db');
const { Prisma } = require('@prisma/client');
const { applyDataScope, MODULES } = require('../../../utils/scoping');

// ─── Cost Control Dashboard & Integrated Monitoring ───────────────────────────
async function getCostControl(project_id, user) {
  const whereProject = applyDataScope(user, { module: MODULES.EXECUTION, isWrite: false });
  whereProject.id = project_id;

  const projectRecord = await prisma.project.findFirst({ where: whereProject });
  if (!projectRecord) throw new Error('Project not found or access denied');
  
  const company_id = projectRecord.company_id; // Anchor to the record's company for internal sub-queries
  const [
    costCodes, 
    materialCosts, 
    laborCosts, 
    equipCosts, 
    pettyCash, 
    petrol,
    purchaseOrders,
    supplierInvoices,
    progressInvoices
  ] = await Promise.all([
    prisma.costCode.findMany({
      where: { wbs: { project_id } },
      include: { wbs: { select: { id: true, name: true, wbs_code: true } } }
    }),
    // Material from inventory issues
    prisma.materialIssueItem.findMany({
      where: { issue: { project_id, company_id } },
      include: { cost_code: true }
    }),
    // Labor from resource logs
    prisma.resourceLog.findMany({
      where: { project_id, company_id, resource_type: 'LABOR' },
      select: { labor_cost: true, wbs_id: true }
    }),
    // Equipment from resource logs
    prisma.resourceLog.findMany({
      where: { project_id, company_id, resource_type: 'EQUIPMENT' },
      select: { equip_cost: true, wbs_id: true }
    }),
    // Petty cash
    prisma.pettyCashRequest.aggregate({
      where: { project_id, company_id, status: 'approved' },
      _sum: { estimated_cost: true }
    }),
    // Petrol
    prisma.petrolExpense.aggregate({
      where: { project_id, company_id },
      _sum: { total_amount: true }
    }),
    // Committed Cost (POs)
    prisma.purchaseOrder.findMany({
      where: { project_id, company_id, status: { notIn: ['draft', 'cancelled', 'rejected'] } },
      select: { total_amount: true, id: true }
    }),
    // Other actual costs (Supplier Invoices not linked to PO, or specialized payments)
    prisma.supplierInvoice.findMany({
      where: { purchase_order: { project_id }, status: 'paid' },
      select: { total_amount: true }
    }),
    // Revenue Tracking (Progress Invoices)
    prisma.progressInvoice.findMany({
      where: { project_id, company_id, status: { in: ['certified', 'paid'] } },
      select: { cumulative_amount: true, gross_payable: true, status: true }
    })
  ]);

  const totalBudget      = costCodes.reduce((s, cc) => s + Number(cc.budget_amount || 0), 0);
  
  // Committed: Total value of all POs issued
  const totalCommitted   = purchaseOrders.reduce((s, po) => s + Number(po.total_amount || 0), 0);
  
  // Actual Cost: Integrated from Execution + Procurement
  const totalMaterial    = materialCosts.reduce((s, m) => s + Number(m.unit_cost) * Number(m.quantity), 0);
  const totalLabor       = laborCosts.reduce((s, l) => s + Number(l.labor_cost || 0), 0);
  const totalEquipment   = equipCosts.reduce((s, e) => s + Number(e.equip_cost || 0), 0);
  const totalPettyCash   = Number(pettyCash._sum.estimated_cost || 0);
  const totalPetrol      = Number(petrol._sum.total_amount || 0);
  
  const totalActual      = totalMaterial + totalLabor + totalEquipment + totalPettyCash + totalPetrol;
  
  // Revenue / Invoicing
  const totalInvoiced    = progressInvoices.reduce((s, pi) => s + Number(pi.cumulative_amount || 0), 0);
  const totalPaid        = progressInvoices.filter(pi => pi.status === 'paid').reduce((s, pi) => s + Number(pi.gross_payable || 0), 0);

  // Cost by category
  const byCategory = {};
  for (const cc of costCodes) {
    if (!byCategory[cc.category]) byCategory[cc.category] = { budget: 0, committed: 0, actual: 0 };
    byCategory[cc.category].budget += Number(cc.budget_amount || 0);
    // Note: To be perfectly accurate, PO items should be matched to categories here
  }

  const cost_variance = totalBudget - totalActual;
  const budget_utilization = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

  return {
    summary: {
      total_budget: Number(totalBudget.toFixed(2)),
      total_committed: Number(totalCommitted.toFixed(2)),
      total_actual: Number(totalActual.toFixed(2)),
      cost_variance: Number(cost_variance.toFixed(2)),
      budget_utilization_pct: Number(budget_utilization.toFixed(2)),
      total_invoiced: Number(totalInvoiced.toFixed(2)),
      total_paid: Number(totalPaid.toFixed(2))
    },
    breakdown: {
      material: Number(totalMaterial.toFixed(2)),
      labor:    Number(totalLabor.toFixed(2)),
      equipment: Number(totalEquipment.toFixed(2)),
      petty_cash: Number(totalPettyCash.toFixed(2)),
      petrol:    Number(totalPetrol.toFixed(2)),
    },
    by_category: Object.entries(byCategory).map(([cat, v]) => ({
      category: cat,
      budget: Number(v.budget.toFixed(2)),
      committed: Number(v.committed.toFixed(2)),
      actual: Number(v.actual.toFixed(2)),
      variance: Number((v.budget - v.actual).toFixed(2)),
    }))
  };
}

// ─── Closure & Snapshots ──────────────────────────────────────────────────────
async function closeBillingCycle(cycleId, user) {
  const cycle = await prisma.billingCycle.findUnique({
    where: { id: cycleId },
    include: { project: true }
  });

  if (!cycle) throw new Error('Billing cycle not found');

  const currentFinancials = await getCostControl(cycle.project_id, user);

  // Take Snapshots for the Dashboard History
  await prisma.costTracking.create({
    data: {
      company_id: cycle.project.company_id,
      project_id: cycle.project_id,
      cycle_id: cycle.id,
      planned_amount: currentFinancials.summary.total_budget,
      committed_amount: currentFinancials.summary.total_committed,
      actual_amount: currentFinancials.summary.total_actual,
      variance: currentFinancials.summary.cost_variance,
    }
  });

  // Mark cycle as closed
  return prisma.billingCycle.update({
    where: { id: cycleId },
    data: { status: 'closed' }
  });
}

module.exports = { getCostControl, closeBillingCycle };

