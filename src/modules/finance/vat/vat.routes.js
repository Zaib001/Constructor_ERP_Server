"use strict";

const express = require("express");
const router  = express.Router();
const ctrl    = require("./vat.controller");
const requirePermission = require("../../../middleware/requirePermission");
const { complianceLimiter } = require("../../../middleware/rateLimiter");

router.get("/configs",            requirePermission("vat.read"),   ctrl.getConfigs);
router.post("/configs",           requirePermission("vat.manage"), ctrl.createConfig);
router.put("/configs/:id",        requirePermission("vat.manage"), ctrl.updateConfig);
router.get("/summary",            requirePermission("vat.read"),   ctrl.getSummary);
router.get("/transactions",       requirePermission("vat.read"),   ctrl.getTransactions);
router.get("/filing/:periodId",   requirePermission("vat.read"),   ctrl.getFilingData);
router.post("/returns/adjustments", requirePermission("vat.manage"), complianceLimiter, ctrl.createAdjustment);
router.get("/returns/summary",     requirePermission("vat.read"),   ctrl.getReturnSummary);
router.get("/returns/history",     requirePermission("vat.read"),   ctrl.getReturnsHistory);
router.post("/returns/close",       requirePermission("vat.manage"), complianceLimiter, ctrl.closePeriod);

module.exports = router;
