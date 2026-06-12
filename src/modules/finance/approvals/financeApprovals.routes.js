"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./financeApprovals.controller");
const requirePermission = require("../../../middleware/requirePermission");

// GET pending Vendor / RFQ approvals
router.get("/pending", requirePermission("finance.read"), controller.getPendingApprovals);

// Action Vendor Approval (Approve / Reject)
router.post("/vendor/:id/action", requirePermission("vendor.approve"), controller.actionVendorApproval);

// Action RFQ Comparison Approval (Approve / Reject)
router.post("/rfq/:id/action", requirePermission("approval.approve"), controller.actionRfqApproval);

module.exports = router;
