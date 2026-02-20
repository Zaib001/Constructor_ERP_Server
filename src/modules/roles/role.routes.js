"use strict";

const { Router } = require("express");
const controller = require("./role.controller");
const { validateCreateRole, validateUpdateRole, validateAssignPermissions } = require("./role.validation");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = Router();

// All role routes require a valid JWT
router.use(authenticateJWT);

/**
 * @route   GET /api/roles
 * @desc    Get all active roles
 * @access  Private
 */
router.get("/", controller.getRoles);

/**
 * @route   POST /api/roles
 * @desc    Create a new role
 * @access  Private — requires role.create
 */
router.post("/", requirePermission("role.create"), validateCreateRole, controller.createRole);

/**
 * @route   PATCH /api/roles/:id
 * @desc    Update a role (system roles blocked)
 * @access  Private — requires role.update
 */
router.patch("/:id", requirePermission("role.update"), validateUpdateRole, controller.updateRole);

/**
 * @route   DELETE /api/roles/:id
 * @desc    Soft-delete a role (system roles blocked)
 * @access  Private — requires role.delete
 */
router.delete("/:id", requirePermission("role.delete"), controller.deleteRole);

/**
 * @route   GET /api/roles/:id/permissions
 * @desc    Get all permissions assigned to a role
 * @access  Private
 */
router.get("/:id/permissions", controller.getRolePermissions);

/**
 * @route   POST /api/roles/:id/assign-permissions
 * @desc    Assign permissions to a role (skips duplicates)
 * @access  Private — requires role.assign_permission
 */
router.post(
    "/:id/assign-permissions",
    requirePermission("role.assign_permission"),
    validateAssignPermissions,
    controller.assignPermissions
);

module.exports = router;
