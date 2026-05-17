"use strict";

const express = require("express");
const router  = express.Router();
const ctrl    = require("./zatca.controller");
const requirePermission = require("../../../middleware/requirePermission");
const { complianceLimiter } = require("../../../middleware/rateLimiter");

router.post("/submit/:invoiceId",   requirePermission("zatca.submit"), complianceLimiter, ctrl.submitInvoice);
router.post("/retry/:id",            requirePermission("zatca.admin"),  complianceLimiter, ctrl.retrySubmission);
router.get("/submissions",          requirePermission("zatca.read"),   ctrl.getSubmissions);
router.get("/submissions/:id/logs", requirePermission("zatca.read"),   ctrl.getSubmissionLogs);
router.post("/csid/onboard",         requirePermission("zatca.admin"),  complianceLimiter, ctrl.onboardCompany);
router.post("/certificates/rotate",  requirePermission("zatca.admin"),  complianceLimiter, ctrl.rotateCertificates);
router.get("/settings",             requirePermission("zatca.read"),   ctrl.getSettings);

module.exports = router;
