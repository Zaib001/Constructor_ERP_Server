"use strict";

const prisma = require("../../../db");
const { applyDataScope } = require("../../../utils/scoping");

/**
 * List logistics requests
 */
async function listLogisticsRequests(filters, user) {
  const where = applyDataScope(user, { projectFilter: true });
  const { status, project_id, request_type } = filters;

  const finalWhere = {
    ...where,
    ...(status && { status }),
    ...(project_id && { project_id }),
    ...(request_type && { request_type })
  };

  return prisma.logisticsRequest.findMany({
    where: finalWhere,
    orderBy: { created_at: 'desc' },
    include: {
      project: { select: { name: true } },
      allocations: {
        include: {
          allocation: {
            select: {
              id: true,
              allocation_type: true,
              planned_qty: true,
              source_type: true
            }
          }
        }
      }
    }
  });
}

/**
 * Create a logistics request linked to allocations
 */
async function createLogisticsRequest(data, user) {
  const { project_id, request_type, description, origin, destination, required_date, allocation_ids } = data;

  return prisma.$transaction(async (tx) => {
    const request = await tx.logisticsRequest.create({
      data: {
        company_id: user.companyId,
        project_id,
        request_type,
        description,
        origin,
        destination,
        required_date: required_date ? new Date(required_date) : null,
        status: 'draft',
        created_by: user.id
      }
    });

    if (allocation_ids && allocation_ids.length > 0) {
      await tx.logisticsAllocation.createMany({
        data: allocation_ids.map(aid => ({
          logistics_request_id: request.id,
          allocation_id: aid
        }))
      });
    }

    return request;
  });
}

module.exports = {
  listLogisticsRequests,
  createLogisticsRequest
};
