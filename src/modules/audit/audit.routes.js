"use strict";

const { Router } = require("express");
const controller = require("./audit.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = Router();

router.get(
    "/logs",
    authenticateJWT,
    requirePermission("audit.read"),
    controller.getAuditLogs
);

module.exports = router;
