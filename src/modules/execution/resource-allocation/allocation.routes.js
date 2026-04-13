"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("./allocation.controller");
const authenticateJWT = require("../../../middleware/authenticateJWT");
const requirePermission = require("../../../middleware/requirePermission");

const canManage = requirePermission("execution.manage");

router.use(authenticateJWT);

router.get("/requirements", ctrl.getPendingRequirements);
router.get("/", ctrl.listAllocations);
router.post("/", canManage, ctrl.createAllocation);
router.post("/generate-pr", canManage, ctrl.generatePR);

module.exports = router;
