"use strict";

const express = require("express");
const router = express.Router();
const payrollController = require("./payroll.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/",    requirePermission("payroll.read"),    payrollController.getAllPayrolls);
router.get("/:id", requirePermission("payroll.read"),    payrollController.getPayrollById);
router.post("/",   requirePermission("payroll.process"), payrollController.createPayroll);

module.exports = router;
