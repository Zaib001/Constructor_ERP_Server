"use strict";

const { Router } = require("express");
const controller = require("./approvals.controller");
const {
    validateRequestApproval,
    validateApproveStep,
    validateRejectStep,
    validateInboxQuery,
    validateHistoryQuery,
} = require("./approvals.validator");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");
const requireProjectAccess = require("../../middleware/requireProjectAccess");

const router = Router();

// All approval routes require a valid JWT
router.use(authenticateJWT);

/**
 * POST /api/approvals/request
 * Submit a document for approval.
 * Also enforces project-level access (body.projectId resolved by middleware).
 */
router.post(
    "/request",
    requirePermission("approval.request"),
    requireProjectAccess(),
    validateRequestApproval,
    controller.requestApproval
);

/**
 * GET /api/approvals/inbox
 * Return pending steps for the authenticated user.
 */
router.get("/inbox", validateInboxQuery, controller.getInbox);

/**
 * GET /api/approvals/history
 * Approval history for a given docType + docId.
 */
router.get("/history", validateHistoryQuery, controller.getHistory);

/**
 * POST /api/approvals/:id/approve
 * Approve the current pending step the user is assigned to.
 */
router.post(
    "/:id/approve",
    requirePermission("approval.approve"),
    validateApproveStep,
    controller.approveStep
);

/**
 * POST /api/approvals/:id/reject
 * Reject the current pending step.
 */
router.post(
    "/:id/reject",
    requirePermission("approval.reject"),
    validateRejectStep,
    controller.rejectStep
);

/**
 * GET /api/approvals/:id
 * Get full details of a specific approval request (including steps).
 */
router.get("/:id", controller.getRequest);

/**
 * POST /api/approvals/:id/cancel
 * Cancel an in-progress approval (requester or admin).
 */
router.post("/:id/cancel", controller.cancelApproval);

module.exports = router;
