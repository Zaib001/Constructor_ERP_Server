"use strict";

const express = require("express");
const router = express.Router();
const receiptsController = require("./receipts.controller");

const { validate, ReceiptSchema } = require("../../../middleware/validate.middleware");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", requirePermission("finance.read"), receiptsController.getReceipts);
router.post("/", requirePermission("finance.payment.create"), validate(ReceiptSchema), receiptsController.recordReceipt);

module.exports = router;
