"use strict";

const express = require("express");
const router = express.Router();
const payrollController = require("./payroll.controller");

const requirePermission = require("../../../middleware/requirePermission");

router.get("/summary", requirePermission("finance.payroll.read"), payrollController.getSalarySummaries);
router.post("/summary", requirePermission("finance.payroll.create"), payrollController.createSalarySummary);
router.post("/summary/:id/finalize", requirePermission("finance.payroll.approve"), payrollController.finalizeSalarySummary);
router.post("/summary/:id/pay", requirePermission("finance.payroll.post"), payrollController.paySalarySummary);
router.get("/notifications", requirePermission("finance.payroll.read"), payrollController.getNotifications);

module.exports = router;
