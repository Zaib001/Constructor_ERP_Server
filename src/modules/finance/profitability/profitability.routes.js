"use strict";

const express = require("express");
const router  = express.Router();
const ctrl    = require("./profitability.controller");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/dashboard",               requirePermission("profitability.read"),     ctrl.getDashboardData);
router.get("/project/:projectId",      requirePermission("profitability.read"),     ctrl.getProjectDrill);
router.get("/department/:departmentId",requirePermission("profitability.read"),     ctrl.getDepartmentDrill);
router.post("/recalculate",            requirePermission("profitability.snapshot"), ctrl.triggerRecalculate);

module.exports = router;
