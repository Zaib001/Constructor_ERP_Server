"use strict";

const express = require("express");
const router = express.Router();
const quotationsController = require("./quotations.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/", requirePermission("procurement.quote.read"), quotationsController.getAllQuotations);
router.get("/:id", requirePermission("procurement.quote.read"), quotationsController.getQuotationById);
router.post("/", requirePermission("procurement.quote.create"), quotationsController.createQuotation);

module.exports = router;
