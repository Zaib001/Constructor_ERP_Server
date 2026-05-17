"use strict";

const express = require("express");
const router = express.Router();
const dashboardController = require("./dashboard.controller");

const requirePermission = require("../../../middleware/requirePermission");

router.get("/summary", requirePermission("finance.read"), dashboardController.getSummary);
router.get("/aging/receivables", requirePermission("finance.read"), dashboardController.getReceivablesAging);
router.get("/aging/payables", requirePermission("finance.read"), dashboardController.getPayablesAging);
router.get("/vat", requirePermission("vat.read"), dashboardController.getVATDashboard);
router.get("/zatca", requirePermission("zatca.read"), dashboardController.getZATCADashboard);
router.get("/profitability", requirePermission("profitability.read"), dashboardController.getProfitabilityKPIs);

module.exports = router;
