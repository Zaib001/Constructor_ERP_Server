"use strict";

const prisma = require("../../../db");
const { applyDataScope } = require("../../../utils/scoping");
const { requestApproval } = require("../../approvals/approvals.service");
const { registerAdapter } = require("../../approvals/approvals.adapter");

// ─── Approval Adapter ────────────────────────────────────────────────────────
registerAdapter("SERVICE_REQUEST", async ({ docId, status }) => {
  let finalStatus = "submitted";
  if (status === "approved") finalStatus = "approved";
  if (status === "rejected") finalStatus = "rejected";
  if (status === "sent_back") finalStatus = "under_review"; // Map sent back to under_review for SR workflow

  await prisma.serviceRequest.update({
    where: { id: docId },
    data: { status: finalStatus }
  });

  // Log status change
  await prisma.serviceRequestStatusLog.create({
    data: {
      request_id: docId,
      status_from: "PENDING_APPROVAL",
      status_to: finalStatus,
      remarks: `Approval engine returned status: ${status}`,
      created_by: "00000000-0000-0000-0000-000000000000" // System Actor
    }
  });
});

/**
 * List service requests with scoping
 */
async function listRequests(filters, user) {
  const where = applyDataScope(user, { projectFilter: true });
  const { status, project_id } = filters;
  
  const finalWhere = {
    ...where,
    ...(status && { status }),
    ...(project_id && { project_id })
  };

  return prisma.serviceRequest.findMany({
    where: finalWhere,
    orderBy: { created_at: 'desc' },
    include: {
      project: { select: { name: true } },
      creator: { select: { name: true } },
      wbs: { select: { name: true } },
      cost_code: { select: { category: true } }
    }
  });
}

/**
 * Create a new service request
 */
async function createRequest(data, user) {
  const { project_id, wbs_id, cost_code_id, description, service_type, estimated_cost, required_date } = data;

  const request = await prisma.serviceRequest.create({
    data: {
      request_no: `SR-${Date.now()}`,
      company_id: user.companyId,
      project_id,
      wbs_id,
      cost_code_id,
      description,
      service_type,
      estimated_cost: Number(estimated_cost) || 0,
      required_date: required_date ? new Date(required_date) : null,
      created_by: user.id,
      status: 'draft'
    }
  });

  await prisma.serviceRequestStatusLog.create({
    data: {
      request_id: request.id,
      status_from: 'NEW',
      status_to: 'draft',
      remarks: 'Initial service request draft created.',
      created_by: user.id
    }
  });

  return request;
}

/**
 * Submit for approval
 */
async function submitForApproval(id, user) {
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: { project: true }
  });

  if (!request) throw new Error("Service Request not found.");
  if (request.status !== 'draft') throw new Error("Only draft requests can be submitted.");

  // Update status to submitted
  await prisma.serviceRequest.update({
    where: { id },
    data: { status: 'submitted' }
  });

  // Request approval logic
  await requestApproval({
    docType: "SERVICE_REQUEST",
    docId: request.id,
    projectId: request.project_id,
    amount: request.estimated_cost,
    remarks: request.description,
    items: [] // Services are usually lump sum or described in text
  }, user.id);

  return { success: true, message: "Request submitted to approval engine." };
}

/**
 * Convert approved Service Request to Purchase Requisition
 */
async function convertToPR(id, user) {
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: { project: true }
  });

  if (!request) throw new Error("Service Request not found.");
  if (request.status !== 'approved') throw new Error("Only approved requests can be converted.");

  const prService = require("../../purchaseRequisitions/purchaseRequisitions.service");

  const prData = {
    project_id: request.project_id,
    wbs_id: request.wbs_id,
    reason: `Converted from Service Request ${request.request_no}`,
    pr_no: `PR-SR-${Date.now()}`,
    items: [{
      item_id: null, // Services don't always have a catalog item
      quantity: 1,
      remarks: `Service Type: ${request.service_type}. Description: ${request.description}`
    }]
  };

  const pr = await prService.createPR(prData, { id: user.id, companyId: user.companyId });

  // Update original request
  await prisma.serviceRequest.update({
    where: { id },
    data: {
      status: 'converted',
      conversion_status: 'FULL',
      converted_pr_id: pr.id
    }
  });

  return pr;
}

module.exports = {
  listRequests,
  createRequest,
  submitForApproval,
  convertToPR
};
