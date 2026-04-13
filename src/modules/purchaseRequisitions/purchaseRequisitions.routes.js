"use strict";
const express = require("express");
const router = express.Router();
const controller = require("./purchaseRequisitions.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/", requirePermission("procurement.pr.read"), controller.getAllPRs);
router.post("/", requirePermission("procurement.pr.create"), controller.createPR);
router.get("/:id", requirePermission("procurement.pr.read"), controller.getPRById);
router.put("/:id", requirePermission("procurement.pr.update"), controller.updatePR);
router.patch("/:id", requirePermission("procurement.pr.update"), controller.updatePR);
router.post("/:id/submit", requirePermission("procurement.pr.submit"), controller.submitPR);
router.post("/:id/approve", requirePermission("procurement.pr.approve"), controller.approvePR);

module.exports = router;
