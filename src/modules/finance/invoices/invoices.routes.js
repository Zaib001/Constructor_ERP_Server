"use strict";

const express = require("express");
const router = express.Router();
const invoicesController = require("./invoices.controller");

const { validate, InvoiceSchema } = require("../../../middleware/validate.middleware");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", requirePermission("finance.read"), invoicesController.getInvoices);
router.post("/", requirePermission("finance.invoice.create"), validate(InvoiceSchema), invoicesController.createInvoice);
router.post("/:id/post", requirePermission("finance.invoice.post"), invoicesController.postInvoice);

module.exports = router;
