"use strict";

const express    = require("express");
const router     = express.Router();
const controller = require("./quality.controller");
const authenticateJWT    = require("../../middleware/authenticateJWT");
const requirePermission  = require("../../middleware/requirePermission");

router.use(authenticateJWT);

// Permission shortcuts
const canRead   = requirePermission(["execution.read",   "quality.read",   "quality.manage", "quality.close"]);
const canManage = requirePermission(["execution.manage", "quality.manage"]);
const canClose  = requirePermission(["execution.manage", "quality.manage", "quality.close"]);

// ── Dashboard & Compliance ───────────────────────────────────────────────────
router.get("/summary/:projectId", canRead, controller.getProjectQualitySummary);
router.get("/compliance/:wbsId", canRead, controller.getWBSCompliance);

// ── ITP Plans ────────────────────────────────────────────────────────────────
router.get ("/itp/:projectId", canRead,   controller.getITPs);
router.post("/itp",            canManage, controller.createITP);
router.patch("/itp/:id/status",canManage, controller.updateITPStatus);

// ── Inspections ───────────────────────────────────────────────────────────────
router.get  ("/inspections/:projectId",  canRead,   controller.getInspections);
router.post ("/inspections",             canManage, controller.createInspection);
router.patch("/inspections/:id/result",  canClose,  controller.recordInspectionResult);
router.patch("/inspections/:id",         canClose,  controller.updateInspection);       // legacy

// ── NCR ───────────────────────────────────────────────────────────────────────
router.get  ("/ncr/:projectId",  canRead,   controller.getNCRs);
router.post ("/ncr",             canManage, controller.createNCR);
router.patch("/ncr/:id/status",  canClose,  controller.updateNCRStatus);

module.exports = router;
