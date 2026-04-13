"use strict";

const express = require("express");
const controller = require("./dashboard.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = express.Router();

// Superadmin dashboard (group level)
router.get("/superadmin", authenticateJWT, requirePermission("dashboard.superadmin"), controller.getSuperadminDashboard);

// Company Head dashboard
router.get("/company", authenticateJWT, requirePermission("dashboard.company"), controller.getCompanyHeadDashboard);

// Department Head dashboard
router.get("/department", authenticateJWT, requirePermission("dashboard.department"), controller.getDepartmentDashboard);

// Project Dashboard (PM/Site Roles)
router.get("/project", authenticateJWT, requirePermission("dashboard.project"), controller.getProjectDashboard);

// Compliance & Expiry Alerts (All manager roles)
router.get("/compliance", authenticateJWT, requirePermission("dashboard.compliance"), controller.getCompliance);

// Workspace Summary (Lightweight KPIs for landing page)
// No specific permission required beyond authentication as it's the default landing view.
router.get("/workspace-summary", authenticateJWT, controller.getWorkspaceSummary);

module.exports = router;
