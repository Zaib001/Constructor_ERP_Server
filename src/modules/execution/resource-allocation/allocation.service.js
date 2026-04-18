"use strict";

const prisma = require("../../../db");

/**
 * List all unallocated or partially allocated requirements for a project
 * Aggregates from BOQValidations, ProcurementPlanItems, and ResourcePlans
 */
async function getPendingRequirements(projectId, companyId) {
  // 1. Validated BOQ Items
  const boqValidations = await prisma.bOQValidation.findMany({
    where: { project_id: projectId, company_id: companyId, is_complete: true },
    include: { boq_item: true, wbs: true, cost_code: true, allocations: true }
  });

  // 2. Procurement Plan Items
  const procItems = await prisma.procurementPlanItem.findMany({
    where: { project_id: projectId, company_id: companyId },
    include: { wbs: true, allocations: true }
  });

  // 3. Resource Plan Items
  const resourcePlans = await prisma.resourcePlan.findMany({
    where: { project_id: projectId, company_id: companyId },
    include: { wbs: true, allocations: true }
  });

  // Format and consolidate
  const consolidated = [
    ...boqValidations.map(v => ({
      source_id: v.id,
      source_type: 'BOQ_VALIDATION',
      item_name: v.boq_item.description,
      wbs_id: v.wbs_id,
      wbs_name: v.wbs.name,
      cost_code_id: v.cost_code_id,
      planned_qty: Number(v.boq_item.planned_qty || 0),
      allocated_qty: v.allocations.reduce((sum, a) => sum + Number(a.planned_qty), 0),
      unit: v.boq_item.unit,
      allocation_type: 'MATERIAL'
    })),
    ...procItems.map(p => ({
      source_id: p.id,
      source_type: 'PROCUREMENT_PLAN',
      item_name: p.item_description,
      wbs_id: p.wbs_id,
      wbs_name: p.wbs?.name || 'N/A',
      planned_qty: 1, // Proc items are usually single units or lump sum
      allocated_qty: p.allocations.reduce((sum, a) => sum + Number(a.planned_qty), 0),
      allocation_type: p.category || 'MATERIAL'
    })),
    ...resourcePlans.map(r => ({
      source_id: r.id,
      source_type: 'RESOURCE_PLAN',
      item_name: r.resource_type === 'MANPOWER' ? r.trade : r.equipment_type,
      wbs_id: r.wbs_id,
      wbs_name: r.wbs?.name || 'N/A',
      planned_qty: r.resource_type === 'MANPOWER' ? r.headcount : r.equipment_count,
      allocated_qty: r.allocations.reduce((sum, a) => sum + Number(a.planned_qty), 0),
      allocation_type: r.resource_type === 'MANPOWER' ? 'LABOR' : 'EQUIPMENT'
    }))
  ];

  return consolidated.filter(c => c.allocated_qty < c.planned_qty);
}

/**
 * Create a new allocation
 */
async function createAllocation(data, userId, companyId) {
  const { 
    project_id, plan_id, department_id, source_type, source_id, 
    allocation_type, planned_qty, required_date, notes 
  } = data;

  // 1. Basic Quantity Validation
  if (Number(planned_qty) <= 0) throw new Error("Planned quantity must be greater than zero.");

  // 2. Resource Traceability Logic (User defined FK requirement)
  const allocationData = {
    company_id: companyId,
    project_id,
    plan_id,
    department_id,
    allocation_type,
    source_type,
    source_id,
    planned_qty: Number(planned_qty),
    required_date: required_date ? new Date(required_date) : null,
    notes,
    created_by: userId,
    status: 'pending'
  };

  // Populate explicit trace IDs based on source
  if (source_type === 'BOQ_VALIDATION') {
    const v = await prisma.bOQValidation.findUnique({ where: { id: source_id }, include: { boq_item: true } });
    if (!v) throw new Error("Source BOQ Validation not found.");
    allocationData.boq_validation_id = v.id;
    allocationData.boq_item_id = v.boq_item_id;
    allocationData.wbs_id = v.wbs_id;
    allocationData.cost_code_id = v.cost_code_id;
  } else if (source_type === 'PROCUREMENT_PLAN') {
    const p = await prisma.procurementPlanItem.findUnique({ where: { id: source_id } });
    if (!p) throw new Error("Source Procurement Item not found.");
    allocationData.procurement_plan_item_id = p.id;
    allocationData.wbs_id = p.wbs_id;
  } else if (source_type === 'RESOURCE_PLAN') {
    const r = await prisma.resourcePlan.findUnique({ where: { id: source_id } });
    if (!r) throw new Error("Source Resource Plan not found.");
    allocationData.resource_plan_id = r.id;
    allocationData.wbs_id = r.wbs_id;
  }

  // Create allocation
  const allocation = await prisma.resourceAllocation.create({
    data: allocationData
  });

  // Log transition
  await prisma.resourceAllocationStatusLog.create({
    data: {
      allocation_id: allocation.id,
      status_from: 'NEW',
      status_to: 'pending',
      remarks: 'Initial allocation created.',
      created_by: userId
    }
  });

  // Log assignment
  await prisma.allocationAssignmentLog.create({
    data: {
      allocation_id: allocation.id,
      department_to: department_id,
      remarks: 'Assigned to department upon creation.',
      created_by: userId
    }
  });

  return allocation;
}

/**
 * List existing allocations
 */
async function listAllocations(filters, companyId) {
  const { project_id, department_id, status } = filters;
  const where = {
    company_id: companyId,
    ...(project_id && { project_id }),
    ...(department_id && { department_id }),
    ...(status && { status })
  };

  return prisma.resourceAllocation.findMany({
    where,
    orderBy: { required_date: 'asc' },
    include: {
      project: { select: { name: true } },
      department: { select: { name: true, code: true } },
      creator: { select: { name: true } }
    }
  });
}

/**
 * Generate PR from Allocation (Partial Support)
 * Logic: Checks requested_qty vs planned_qty, updates allocation, creates PR record
 */
async function generatePRFromAllocation(id, qty, userId, companyId) {
  const allocation = await prisma.resourceAllocation.findFirst({
    where: { id, company_id: companyId },
    include: { project: true }
  });

  if (!allocation) throw new Error("Allocation not found.");
  if (allocation.status === 'locked') throw new Error("This allocation is locked.");

  const requestQty = Number(qty);
  const currentRequested = Number(allocation.requested_qty);
  const planned = Number(allocation.planned_qty);

  // Constraint 4: requested_qty <= planned_qty
  if (currentRequested + requestQty > planned) {
    throw new Error(`Quantity exceeds remaining plan. Available: ${planned - currentRequested}`);
  }

  // 1. Create the PR using existing PR Service Pattern
  const prService = require("../../purchaseRequisitions/purchaseRequisitions.service");
  
  // Create dummy PR payload
  const prData = {
    project_id: allocation.project_id,
    wbs_id: allocation.wbs_id,
    reason: `System generated from Resource Allocation. Source: ${allocation.source_type}`,
    pr_no: `PR-ALC-${Date.now()}-${userId.slice(0, 4)}`,
    items: [{
      item_id: null, // BOQ items are not Catalog items; we use description-based PRs for non-catalog resources
      quantity: requestQty,
      remarks: `Allocation Ref: ${allocation.id}. Item: ${allocation.item_name || 'Resource Resource'}. Source: ${allocation.source_type}`
    }]
  };

  const pr = await prService.createPR(prData, { id: userId, company_id: companyId });

  // 2. Update Allocation
  const newRequestedQty = currentRequested + requestQty;
  await prisma.resourceAllocation.update({
    where: { id },
    data: {
      requested_qty: newRequestedQty,
      status: newRequestedQty >= planned ? 'pr_created' : 'assigned',
      is_locked: true // Constraint 5: Lock when requested_qty > 0
    }
  });

  // 3. Log event
  await prisma.resourceAllocationStatusLog.create({
    data: {
      allocation_id: allocation.id,
      status_from: allocation.status,
      status_to: newRequestedQty >= planned ? 'pr_created' : 'assigned',
      remarks: `PR generated for qty: ${requestQty}. PR ID: ${pr.id}`,
      created_by: userId
    }
  });

  return { pr, updatedAllocationId: allocation.id };
}

module.exports = {
  getPendingRequirements,
  createAllocation,
  listAllocations,
  generatePRFromAllocation
};
