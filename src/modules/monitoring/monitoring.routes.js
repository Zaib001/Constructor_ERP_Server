const express = require("express");
const router = express.Router();
const controller = require("./monitoring.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

/**
 * Monitoring & Control Routes (Phase 5)
 */

router.get("/dashboard/:projectId",
    authenticateJWT,
    requirePermission("execution.read"),
    controller.getDashboardMetrics
);

router.get("/productivity/:projectId",
    authenticateJWT,
    requirePermission("execution.read"),
    controller.getProductivityDetails
);

router.get("/cost-analysis/:projectId",
    authenticateJWT,
    requirePermission("execution.read"),
    controller.getCostAnalysis
);

router.get("/resource-trends/:projectId",
    authenticateJWT,
    requirePermission("execution.read"),
    controller.getResourceTrends
);

module.exports = router;
