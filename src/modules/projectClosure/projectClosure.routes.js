const express = require("express");
const router = express.Router();
const closureController = require("./projectClosure.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

router.use(authenticateJWT);

// Readiness & Status
router.get("/:projectId/readiness", closureController.handleGetReadiness);
router.get("/:projectId/status", closureController.handleGetClosureStatus);

// Punch List (Snags)
router.get("/:projectId/punch-list", closureController.handleGetPunchList);
router.post("/:projectId/punch-list", closureController.handleCreatePunchItem);
router.patch("/punch-list/:id/status", closureController.handleUpdatePunchStatus);

// Final Closure Submission
router.post("/:projectId/submit", closureController.handleSubmitClosure);

module.exports = router;
