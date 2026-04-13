"use strict";
const express = require("express");
const router = express.Router();
const controller = require("./pettyCash.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/requests", requirePermission("pettycash.read"), controller.getAllRequests);
router.post("/requests", requirePermission("pettycash.create"), controller.createRequest);
router.get("/requests/:id", requirePermission("pettycash.read"), controller.getRequestById);
router.post("/expenses", requirePermission("pettycash.expense.create"), controller.submitExpense);
router.get("/expenses", requirePermission("pettycash.read"), controller.getAllExpenses);
router.post("/expenses/:id/verify", requirePermission("pettycash.expense.verify"), controller.verifyExpense);

module.exports = router;
