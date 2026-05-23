"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("./reports.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

router.use(authenticateJWT);

router.get("/project-health", ctrl.projectHealth);
router.get("/cost-overrun", ctrl.costOverrun);
router.get("/procurement-delays", ctrl.procurementDelays);
router.get("/asset-utilization", ctrl.assetUtilization);
router.get("/executive-kpi", ctrl.executiveKPIs);

module.exports = router;
