"use strict";

const express = require("express");
const router = express.Router();
const vouchersController = require("./vouchers.controller");

const { validate, VoucherSchema } = require("../../../middleware/validate.middleware");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", requirePermission("finance.read"), vouchersController.getVouchers);
router.post("/", requirePermission("finance.voucher.create"), validate(VoucherSchema), vouchersController.createVoucher);
router.post("/:id/post", requirePermission("finance.voucher.post"), vouchersController.postVoucher);
router.post("/:id/reverse", requirePermission("finance.voucher.reverse"), vouchersController.reverseVoucher);

module.exports = router;
