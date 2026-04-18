"use strict";

const prisma = require("../../../db");
const { applyDataScope } = require("../../../utils/scoping");

/**
 * List inventory planning requests
 */
async function listInventoryRequests(filters, user) {
  const where = applyDataScope(user, { projectFilter: true });
  const { reservation_status, project_id, store_id } = filters;

  const finalWhere = {
    ...where,
    ...(reservation_status && { reservation_status }),
    ...(project_id && { project_id }),
    ...(store_id && { store_id })
  };

  return prisma.inventoryPlanningRequest.findMany({
    where: finalWhere,
    orderBy: { required_date: 'asc' },
    include: {
      project: { select: { name: true } },
      item: { select: { name: true, unit: true, category: true } },
      store: { select: { name: true } },
      allocation: { select: { id: true, source_type: true } }
    }
  });
}

/**
 * Create a new inventory planning request (Reservation)
 */
async function createInventoryRequest(data, user) {
  const { project_id, wbs_id, allocation_id, item_id, store_id, quantity, required_date } = data;

  return prisma.inventoryPlanningRequest.create({
    data: {
      company_id: user.companyId,
      project_id,
      wbs_id,
      allocation_id,
      item_id,
      store_id,
      quantity: Number(quantity),
      required_date: required_date ? new Date(required_date) : null,
      reservation_status: 'PENDING',
      created_by: user.id,
      status: 'draft'
    }
  });
}

/**
 * Update reservation status
 */
async function updateReservationStatus(id, status, user) {
  // Simple state machine for now
  const request = await prisma.inventoryPlanningRequest.findUnique({ where: { id } });
  if (!request) throw new Error("Request not found.");

  return prisma.inventoryPlanningRequest.update({
    where: { id },
    data: { reservation_status: status }
  });
}

module.exports = {
  listInventoryRequests,
  createInventoryRequest,
  updateReservationStatus
};
