"use strict";

const express = require("express");
const router = express.Router();
const wbsController = require("./wbs.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/",             requirePermission(["wbs.read", "execution.read", "quality.read", "quality.manage"]),    wbsController.getAllWBS);
router.get("/:id",          requirePermission(["wbs.read", "execution.read", "quality.read", "quality.manage"]),    wbsController.getWBSById);
router.post("/",            requirePermission("wbs.create"),  wbsController.createWBS);
router.put("/:id",          requirePermission("wbs.update"),  wbsController.updateWBS);
router.delete("/:id",       requirePermission("wbs.archive"), wbsController.deleteWBS);

router.post("/cost-codes",        requirePermission("wbs.create"), wbsController.createCostCode);
router.put("/cost-codes/:id",     requirePermission("wbs.update"), wbsController.updateCostCodeBudget);
router.delete("/cost-codes/:id",  requirePermission("wbs.archive"),wbsController.deleteCostCode);

module.exports = router;
