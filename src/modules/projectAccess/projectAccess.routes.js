"use strict";

const { Router } = require("express");
const controller = require("./projectAccess.controller");
const { validateAssignAccess, validateUpdateAccess } = require("./projectAccess.validation");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = Router();

// All project-access routes require a valid JWT
router.use(authenticateJWT);

/**
 * @route   GET /api/project-access
 * @desc    Get all active project assignments (Admin overview)
 * @access  Private — requires project.access.manage
 */
router.get(
    "/",
    requirePermission("project.access.manage"),
    controller.getAllAssignments
);

router.get("/projects", controller.getAllProjects);

/**
 * @route   POST /api/project-access/assign
 * @desc    Assign a user to a project with a specific access level
 * @access  Private — requires project_access.assign
 */
router.post(
    "/assign",
    requirePermission("project.access.manage"),
    validateAssignAccess,
    controller.assignAccess
);

/**
 * @route   PATCH /api/project-access/:id
 * @desc    Update the access level of an existing assignment
 * @access  Private — requires project_access.update
 */
router.patch(
    "/:id",
    requirePermission("project.access.manage"),
    validateUpdateAccess,
    controller.updateAccess
);

/**
 * @route   DELETE /api/project-access/:id
 * @desc    Revoke a user's project access (soft delete via revokedAt)
 * @access  Private — requires project_access.revoke
 */
router.delete(
    "/:id",
    requirePermission("project.access.manage"),
    controller.revokeAccess
);

/**
 * @route   GET /api/project-access/user/:userId
 * @desc    Get all active project assignments for a user
 * @access  Private
 */
router.get("/user/:userId", controller.getUserProjects);

/**
 * @route   GET /api/project-access/project/:projectId
 * @desc    Get all active users assigned to a project
 * @access  Private
 */
router.get("/project/:projectId", controller.getProjectUsers);

module.exports = router;
