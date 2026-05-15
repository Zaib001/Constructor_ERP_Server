"use strict";

const express = require("express");
const router = express.Router();
const vendorPaymentsController = require("./vendorPayments.controller");

const { validate, PaymentSchema } = require("../../../middleware/validate.middleware");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", requirePermission("finance.read"), vendorPaymentsController.getPayments);
router.post("/", requirePermission("finance.payment.create"), validate(PaymentSchema), vendorPaymentsController.recordPayment);

module.exports = router;
