"use strict";
const express = require("express");
const router = express.Router();
const controller = require("./rfqs.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/", requirePermission("procurement.rfq.read"), controller.getAllRFQs);
router.post("/", requirePermission("procurement.rfq.create"), controller.createRFQ);
router.get("/:id", requirePermission("procurement.rfq.read"), controller.getRFQById);
router.post("/:id/vendors", requirePermission("procurement.rfq.update"), controller.addVendors);
router.post("/:id/quotes", requirePermission("procurement.quote.create"), controller.submitQuote);
router.post("/:id/compare", requirePermission("procurement.comparison.run"), controller.compareQuotes);

module.exports = router;
