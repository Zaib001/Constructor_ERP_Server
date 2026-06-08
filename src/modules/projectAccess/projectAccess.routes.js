"use strict";

const { Router } = require("express");
const controller = require("./projectAccess.controller");
const usersController = require("../users/users.controller");
const { validateAssignAccess, validateUpdateAccess } = require("./projectAccess.validation");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = Router();
router.use(authenticateJWT);

router.get("/", requirePermission("project.access.manage"), controller.getAllAssignments);
router.get("/projects", controller.getAllProjects);

// Feature 2 spec: body-based assign/remove (POST / DELETE on root)
router.post("/", requirePermission("project.access.manage"), usersController.assignProjectAccess);
router.delete("/", requirePermission("project.access.manage"), usersController.removeProjectAccess);

// Existing path-based endpoints (used by existing frontend)
router.post("/assign", requirePermission("project.access.manage"), validateAssignAccess, controller.assignAccess);
router.patch("/:id", requirePermission("project.access.manage"), validateUpdateAccess, controller.updateAccess);
router.delete("/:id", requirePermission("project.access.manage"), controller.revokeAccess);
router.get("/user/:userId", controller.getUserProjects);
router.get("/project/:projectId", controller.getProjectUsers);

module.exports = router;
