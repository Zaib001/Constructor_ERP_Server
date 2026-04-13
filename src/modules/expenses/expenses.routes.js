"use strict";

const express = require("express");
const router = express.Router();
const expensesController = require("./expenses.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/",    requirePermission("expense.read"),   expensesController.getAllExpenses);
router.get("/:id", requirePermission("expense.read"),   expensesController.getExpenseById);
router.post("/",   requirePermission("expense.create"), expensesController.createExpense);
router.put("/:id", requirePermission("expense.verify"), expensesController.updateExpense || expensesController.createExpense);

module.exports = router;
