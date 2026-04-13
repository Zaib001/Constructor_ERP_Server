const prisma = require('../../../db');
const { registerAdapter } = require('../../approvals/approvals.adapter');

// ─── Approval Adapter Registration ───────────────────────────────────────────
registerAdapter('PROJECT_PLAN', async ({ docId, status }) => {
  // Usually status comes back as APPROVED or REJECTED.
  // We lowercase it to match the schema constraints (e.g., 'approved', 'rejected')
  const newStatus = status.toLowerCase();
  
  await prisma.projectPlan.update({
    where: { id: docId },
    data: { 
      status: newStatus,
      ...(newStatus === 'approved' ? { approved_at: new Date() } : {})
    }
  });
});

async function createPlan(data, userId, companyId) {
  const project_id = data.project_id;
  const title = data.title;
  const plan_type = data.plan_type || 'BASELINE';
  const baseline_start = data.baseline_start || data.start_date;
  const baseline_end = data.baseline_end || data.end_date;
  const baseline_duration = data.baseline_duration;
  const contract_value = data.contract_value;
  const notes = data.notes;
  const plan_no = data.plan_no || `PLN-${Date.now().toString().slice(-6)}`;

  // Validate Project
  // Relaxed ownership check: if project.company_id is null, allow it (legacy/generic projects).
  // Otherwise, must match user's companyId.
  const project = await prisma.project.findFirst({
    where: { 
      id: project_id,
      OR: [
        { company_id: companyId },
        { company_id: null }
      ]
    }
  });
  if (!project) {
    console.error(`Plan Creation Failed: Project ${project_id} not found or not accessible for company ${companyId}`);
    throw new Error('Project not found or access denied');
  }

  return prisma.projectPlan.create({
    data: {
      company_id: companyId,
      project_id,
      plan_no,
      title,
      plan_type,
      baseline_start: baseline_start ? new Date(baseline_start) : null,
      baseline_end: baseline_end ? new Date(baseline_end) : null,
      baseline_duration: baseline_duration ? Number(baseline_duration) : null,
      contract_value: contract_value ? Number(contract_value) : null,
      notes,
      created_by: userId
    }
  });
}

async function listPlans({ project_id, status, plan_type, page = 1, limit = 20 }, companyId) {
  const where = {
    company_id: companyId,
    ...(project_id && { project_id }),
    ...(status && { status }),
    ...(plan_type && { plan_type }),
  };

  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Number(limit) || 20);

  const [data, total] = await Promise.all([
    prisma.projectPlan.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (p - 1) * l,
      take: l,
      include: {
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } }
      }
    }),
    prisma.projectPlan.count({ where })
  ]);
  return { data, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
}

async function getPlan(id, companyId) {
  return prisma.projectPlan.findFirst({
    where: { id, company_id: companyId },
    include: {
      boq_validations: { include: { boq_item: true, wbs: true, cost_code: true } },
      schedules: { include: { wbs: true } },
      procurement_items: { include: { wbs: true, vendor: true } },
      resource_plans: { include: { wbs: true } },
      project: { select: { id: true, name: true, code: true } }
    }
  });
}

// ─── BOQ Validation ──────────────────────────────────────────────────────────
async function syncBOQValidations(plan_id, project_id, userId, companyId) {
  // First, get all BOQ Items for the project
  const boqItems = await prisma.bOQItem.findMany({
    where: { project_id, company_id: companyId }
  });

  if (!boqItems.length) {
    throw new Error('No BOQ Items found for this project.');
  }

  // Find existing validations
  const existing = await prisma.bOQValidation.findMany({
    where: { plan_id, company_id: companyId }
  });
  const existingIds = new Set(existing.map(e => e.boq_item_id));

  // Determine Missing
  const missing = boqItems.filter(b => !existingIds.has(b.id));

  if (missing.length > 0) {
    await prisma.bOQValidation.createMany({
      data: missing.map(b => ({
        company_id: companyId,
        project_id,
        plan_id,
        boq_item_id: b.id,
        wbs_id: b.wbs_id,
        is_wbs_linked: true, // WBS is mandatory on BOQItem
        is_rate_valid: Number(b.unit_rate) > 0,
        is_cost_coded: false,
        is_complete: Number(b.unit_rate) > 0 // Temporarily unblocked: Ready for allocation if valid rate exists
      }))
    });
  }

  return listBOQValidations({ plan_id }, companyId);
}

async function listBOQValidations({ plan_id, project_id, is_complete, page = 1, limit = 100 }, companyId) {
  const where = {
    company_id: companyId,
    ...(plan_id && { plan_id }),
    ...(project_id && { project_id }),
    ...(is_complete !== undefined && { is_complete: is_complete === 'true' })
  };

  const [data, total] = await Promise.all([
    prisma.bOQValidation.findMany({
      where,
      orderBy: { created_at: 'asc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        boq_item: true, wbs: true, cost_code: true
      }
    }),
    prisma.bOQValidation.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateBOQValidation(id, data, userId, companyId) {
  const v = await prisma.bOQValidation.findFirst({ where: { id, company_id: companyId }, include: { boq_item: true } });
  if (!v) throw new Error('Validation record not found');

  const updates = { ...data };
  
  if (data.cost_code_id) {
    updates.is_cost_coded = true;
  }

  // Recalculate completeness
  const isWbs = updates.wbs_id ? true : v.is_wbs_linked;
  const isCostCoded = updates.is_cost_coded !== undefined ? updates.is_cost_coded : v.is_cost_coded;
  const isRate = v.boq_item.unit_rate > 0;
  
  updates.is_complete = isWbs && isCostCoded && isRate;
  
  if (updates.is_complete !== v.is_complete) {
      if (updates.is_complete) {
          updates.validated_by = userId;
          updates.validated_at = new Date();
      } else {
          updates.validated_by = null;
          updates.validated_at = null;
      }
  }

  return prisma.bOQValidation.update({
    where: { id },
    data: updates
  });
}

// ─── Procurement Plan ────────────────────────────────────────────────────────
async function createProcurementItem(data, userId, companyId) {
  return prisma.procurementPlanItem.create({
    data: {
      ...data,
      company_id: companyId,
      created_by: userId,
      required_date: data.required_date ? new Date(data.required_date) : null,
      pr_required_by: data.pr_required_by ? new Date(data.pr_required_by) : null
    }
  });
}

async function listProcurementItems({ plan_id, project_id, is_long_lead, status, page = 1, limit = 50 }, companyId) {
  const where = {
    company_id: companyId,
    ...(plan_id && { plan_id }),
    ...(project_id && { project_id }),
    ...(is_long_lead !== undefined && { is_long_lead: is_long_lead === 'true' }),
    ...(status && { status })
  };

  const [data, total] = await Promise.all([
    prisma.procurementPlanItem.findMany({
      where, orderBy: { required_date: 'asc' },
      skip: (Number(page) - 1) * Number(limit), take: Number(limit),
      include: { wbs: { select: { id: true, name: true } }, vendor: { select: { id: true, name: true } } }
    }),
    prisma.procurementPlanItem.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateProcurementItem(id, data, companyId) {
  return prisma.procurementPlanItem.update({
    where: { id, company_id: companyId },
    data: {
      ...data,
      required_date: data.required_date ? new Date(data.required_date) : undefined,
      pr_required_by: data.pr_required_by ? new Date(data.pr_required_by) : undefined
    }
  });
}

async function deleteProcurementItem(id, companyId) {
  return prisma.procurementPlanItem.delete({
    where: { id, company_id: companyId }
  });
}

// ─── Resource Plan ───────────────────────────────────────────────────────────
async function createResourcePlan(data, userId, companyId) {
  return prisma.resourcePlan.create({
    data: {
      ...data,
      company_id: companyId,
      created_by: userId,
      planned_start: data.planned_start ? new Date(data.planned_start) : null,
      planned_end: data.planned_end ? new Date(data.planned_end) : null
    }
  });
}

async function listResourcePlans({ plan_id, project_id, resource_type, page = 1, limit = 50 }, companyId) {
  const where = {
    company_id: companyId,
    ...(plan_id && { plan_id }),
    ...(project_id && { project_id }),
    ...(resource_type && { resource_type })
  };

  const [data, total] = await Promise.all([
    prisma.resourcePlan.findMany({
      where, orderBy: { planned_start: 'asc' },
      skip: (Number(page) - 1) * Number(limit), take: Number(limit),
      include: { wbs: { select: { id: true, name: true } } }
    }),
    prisma.resourcePlan.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateResourcePlan(id, data, companyId) {
  return prisma.resourcePlan.update({
    where: { id, company_id: companyId },
    data: {
      ...data,
      planned_start: data.planned_start ? new Date(data.planned_start) : undefined,
      planned_end: data.planned_end ? new Date(data.planned_end) : undefined
    }
  });
}

async function deleteResourcePlan(id, companyId) {
  return prisma.resourcePlan.delete({
    where: { id, company_id: companyId }
  });
}

// ─── Document Status Adapter Updates ─────────────────────────────────────────
async function updatePlanStatus(id, status, companyId) {
  return prisma.projectPlan.update({
    where: { id, company_id: companyId },
    data: { 
      status,
      ...(status === 'approved' ? { approved_at: new Date() } : {})
    }
  });
}

module.exports = {
  createPlan, listPlans, getPlan, updatePlanStatus,
  syncBOQValidations, listBOQValidations, updateBOQValidation,
  createProcurementItem, listProcurementItems, updateProcurementItem, deleteProcurementItem,
  createResourcePlan, listResourcePlans, updateResourcePlan, deleteResourcePlan
};
