"use strict";

const { Router } = require("express");
const controller = require("./systemLogs.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");
const requireSuperAdmin = require("../../middleware/requireSuperAdmin");

const router = Router();

/**
 * GET /api/system/logs
 * Admin only — requires audit.read permission.
 */
router.get(
    "/logs",
    authenticateJWT,
    requireSuperAdmin,
    controller.getSystemLogs
);

module.exports = router;
