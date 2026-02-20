"use strict";

const { Router } = require("express");
const controller = require("./session.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = Router();

// All session routes require authentication
router.use(authenticateJWT);

/**
 * GET /api/sessions/my
 * List all active sessions for the current user.
 */
router.get("/my", controller.getMySessions);

/**
 * DELETE /api/sessions/:sessionId
 * Logout from a specific session.
 */
router.delete("/:sessionId", controller.revokeSession);

/**
 * POST /api/sessions/terminate-others
 * Logout from all other devices except the current one.
 */
router.post("/terminate-others", controller.terminateOtherSessions);

/**
 * POST /api/sessions/admin/logout-user
 * Force logout a user from all devices (Admin only).
 */
router.post(
    "/admin/logout-user",
    requirePermission("session.admin_logout"),
    controller.adminLogoutUser
);

module.exports = router;
