"use strict";

const { Router } = require("express");
const controller = require("./audit.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");
const requireSuperAdmin = require("../../middleware/requireSuperAdmin");

const router = Router();

/**
 * GET /api/audit/logs
 * Requires: JWT + audit.read permission.
 * Audit logs are READ-ONLY — no create/update/delete routes.
 */
router.get(
    "/logs",
    authenticateJWT,
    requireSuperAdmin,
    controller.getAuditLogs
);

module.exports = router;
