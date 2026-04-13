"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./petrolExpenses.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/", requirePermission("petrol.read"), controller.getAllExpenses);
router.get("/reports", requirePermission("petrol.read"), controller.getReports);
router.post("/", requirePermission("petrol.create"), controller.createExpense);
router.get("/:id", requirePermission("petrol.read"), controller.getExpenseById);
router.put("/:id", requirePermission("petrol.create"), controller.updateExpense);
router.post("/:id/verify", requirePermission("petrol.verify"), controller.verifyExpense);
router.post("/:id/reject", requirePermission("petrol.verify"), controller.rejectExpense);

module.exports = router;
