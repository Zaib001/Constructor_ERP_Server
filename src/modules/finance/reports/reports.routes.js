"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./reports.controller");

const requirePermission = require("../../../middleware/requirePermission");

router.get("/pnl", requirePermission("finance.read"), controller.getPnL);
router.get("/balance-sheet", requirePermission("finance.read"), controller.getBalanceSheet);
router.get("/trial-balance", requirePermission("finance.read"), controller.getTrialBalance);
router.get("/cash-flow", requirePermission("finance.read"), controller.getCashFlow);

// Exports
router.get("/export/vat",           requirePermission("vat.read"),           controller.exportVATReport);
router.get("/export/zatca",         requirePermission("zatca.read"),         controller.exportZATCALog);
router.get("/export/profitability", requirePermission("profitability.read"), controller.exportProfitabilityReport);

module.exports = router;
