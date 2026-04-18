const prisma = require('../../../db');
const { Prisma } = require('@prisma/client');
const { applyDataScope, MODULES, validateResourceAccess } = require('../../../utils/scoping');

function generateInvoiceNo(projectCode, count) {
  return `INV-${projectCode || 'PRJ'}-${String(count + 1).padStart(4, '0')}`;
}

// ─── Billing Cycles ───────────────────────────────────────────────────────────
async function createBillingCycle(data, user) {
  const companyId = user.isSuperAdmin ? (data.company_id || user.companyId) : user.companyId;
  return prisma.billingCycle.create({
    data: {
      ...data,
      company_id: companyId,
      start_date: new Date(data.start_date),
      end_date: new Date(data.end_date)
    }
  });
}

async function listBillingCycles(projectId, user) {
  // BillingCycle has no deleted_at column
  const where = applyDataScope(user, { module: MODULES.EXECUTION, isWrite: false, noSoftDelete: true });
  where.project_id = projectId;

  return prisma.billingCycle.findMany({
    where,
    orderBy: { start_date: 'desc' },
    include: { _count: { select: { invoices: true } } }
  });
}

// ─── Create Progress Invoice ──────────────────────────────────────────────────
async function createProgressInvoice(data, user) {
  const { id: userId, companyId } = user;
  const {
    project_id, cycle_id, invoice_date, notes
  } = data;

  await validateResourceAccess(prisma, "project", project_id, user, { module: MODULES.PROJECTS, isWrite: false });
  if (!project) throw new Error('Project not found');

  const cycle = cycle_id ? await prisma.billingCycle.findUnique({ where: { id: cycle_id } }) : null;
  const period_from = cycle ? cycle.start_date : new Date();
  const period_to = cycle ? cycle.end_date : new Date();

  // Get previous certified invoice to pull cumulative figures
  const lastInvoice = await prisma.progressInvoice.findFirst({
    where: { project_id, company_id: companyId, status: { in: ['certified', 'paid'] } },
    orderBy: { created_at: 'desc' },
    include: { items: true }
  });

  const prev_certified_amount = lastInvoice ? Number(lastInvoice.cumulative_amount) : 0;

  // Get BOQ items and current WBS progress
  const boqItems = await prisma.bOQItem.findMany({
    where: { project_id, company_id: companyId },
    include: { wbs: { select: { id: true, progress_pct: true, name: true, wbs_code: true } } }
  });

  if (!boqItems.length) throw new Error('No BOQ items found for project. Add BOQ items first.');

  const contract_value = boqItems.reduce((s, b) => s + Number(b.total_amount), 0);

  // Build invoice line items
  const lineItems = boqItems.map(b => {
    const cumul_pct     = Math.min(100, Number(b.wbs?.progress_pct || 0));
    
    // Find this item in the previous invoice
    const prevItem      = lastInvoice?.items.find(i => i.boq_item_id === b.id);
    const prev_pct      = prevItem ? Number(prevItem.cumul_pct) : 0;
    
    const this_pct      = Math.max(0, cumul_pct - prev_pct);
    const this_amount   = (this_pct / 100) * Number(b.total_amount);

    return {
      wbs_id: b.wbs_id,
      boq_item_id: b.id,
      description: b.description,
      unit: b.unit,
      contract_qty: Number(b.planned_qty),
      unit_rate: Number(b.unit_rate),
      contract_amount: Number(b.total_amount),
      prev_pct: Number(prev_pct.toFixed(4)),
      this_pct: Number(this_pct.toFixed(4)),
      cumul_pct: Number(cumul_pct.toFixed(4)),
      this_amount: Number(this_amount.toFixed(2)),
    };
  });

  const this_period_amount  = lineItems.reduce((s, l) => s + l.this_amount, 0);
  const cumulative_amount   = prev_certified_amount + this_period_amount;
  const this_period_pct     = contract_value > 0 ? (this_period_amount / contract_value) * 100 : 0;
  const cumulative_pct      = contract_value > 0 ? (cumulative_amount / contract_value) * 100 : 0;
  
  // Industry Standard Calculations
  const rentention_rate     = Number(project.retention_pct || 10) / 100;
  const retention_amount    = this_period_amount * rentention_rate;
  
  const recovery_rate       = Number(project.advance_recovery_pct || 10) / 100;
  const advance_recovery    = this_period_amount * recovery_rate;
  
  const net_payable         = this_period_amount - retention_amount - advance_recovery;
  const vat_pct             = 15; // Standard
  const vat_amount          = net_payable * (vat_pct / 100);
  const gross_payable       = net_payable + vat_amount;

  const count = await prisma.progressInvoice.count({ where: { project_id, company_id: companyId } });
  const invoice_no = generateInvoiceNo(project.code, count);

  const invoice = await prisma.progressInvoice.create({
    data: {
      company_id: companyId,
      project_id,
      cycle_id,
      invoice_no,
      period_from,
      period_to,
      invoice_date: new Date(invoice_date || new Date()),
      contract_value: Number(contract_value.toFixed(2)),
      prev_certified_pct: lastInvoice ? Number(lastInvoice.cumulative_pct) : 0,
      prev_certified_amount,
      this_period_pct: Number(this_period_pct.toFixed(4)),
      this_period_amount: Number(this_period_amount.toFixed(2)),
      cumulative_pct: Number(cumulative_pct.toFixed(4)),
      cumulative_amount: Number(cumulative_amount.toFixed(2)),
      retention_pct: Number(project.retention_pct || 10),
      retention_amount: Number(retention_amount.toFixed(2)),
      advance_recovery: Number(advance_recovery.toFixed(2)),
      net_payable: Number(net_payable.toFixed(2)),
      vat_pct,
      vat_amount: Number(vat_amount.toFixed(2)),
      gross_payable: Number(gross_payable.toFixed(2)),
      notes,
      created_by: userId,
      items: { create: lineItems }
    },
    include: { items: true, project: { select: { id: true, name: true, code: true, client: true } } }
  });

  return invoice;
}

// ─── List Progress Invoices ───────────────────────────────────────────────────
async function listInvoices({ project_id, status, page = 1, limit = 20 }, user) {
  // ProgressInvoice has no deleted_at column
  const where = applyDataScope(user, { module: MODULES.EXECUTION, isWrite: false, noSoftDelete: true });
  if (project_id) where.project_id = project_id;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.progressInvoice.findMany({
      where, orderBy: { created_at: 'desc' },
      skip: (Number(page) - 1) * Number(limit), take: Number(limit),
      include: { 
        project: { select: { id: true, name: true, code: true } }, 
        cycle: { select: { cycle_name: true } },
        _count: { select: { items: true } } 
      }
    }),
    prisma.progressInvoice.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get Invoice ─────────────────────────────────────────────────────────────
async function getInvoiceById(id, user) {
  // ProgressInvoice has no deleted_at column
  const where = applyDataScope(user, { module: MODULES.EXECUTION, isWrite: false, noSoftDelete: true });
  where.id = id;

  return prisma.progressInvoice.findFirst({
    where,
    include: {
      items: { include: { wbs: { select: { id: true, name: true, wbs_code: true } } } },
      project: { select: { id: true, name: true, code: true, client: true, contract_value: true } },
      cycle: true
    }
  });
}

// ─── Submit / Certify Invoice ─────────────────────────────────────────────────
async function updateInvoiceStatus(id, action, data, user) {
  await validateResourceAccess(prisma, "progressInvoice", id, user, { module: MODULES.EXECUTION, isWrite: true });
  const statusMap = { submit: 'submitted', certify: 'certified', pay: 'paid', reject: 'rejected' };
  const newStatus = statusMap[action];
  if (!newStatus) throw new Error('Invalid action');

  return prisma.progressInvoice.update({
    where: { id },
    data: {
      status: newStatus,
      ...(action === 'submit' && { submitted_at: new Date() }),
      ...(action === 'certify' && { certified_at: new Date(), certified_by: data?.certified_by }),
      ...(action === 'pay'     && { paid_at: new Date() }),
    }
  });
}

module.exports = { 
  createProgressInvoice, listInvoices, getInvoiceById, updateInvoiceStatus,
  createBillingCycle, listBillingCycles
};

