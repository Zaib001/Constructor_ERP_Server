"use strict";

const express = require("express");
const router = express.Router();
const vendorBillsController = require("./vendorBills.controller");

const { validate, VendorBillSchema } = require("../../../middleware/validate.middleware");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", requirePermission("finance.read"), vendorBillsController.getBills);
router.post("/", requirePermission("finance.bill.create"), validate(VendorBillSchema), vendorBillsController.createBill);
router.post("/:id/approve", requirePermission("finance.bill.approve"), vendorBillsController.approveBill);

module.exports = router;
