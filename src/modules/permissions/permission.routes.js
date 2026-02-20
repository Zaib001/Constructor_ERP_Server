"use strict";

const { Router } = require("express");
const controller = require("./permission.controller");
const { validateCreatePermission } = require("./permission.validation");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = Router();

// All permission routes require a valid JWT
router.use(authenticateJWT);

/**
 * @route   GET /api/permissions
 * @desc    Get all permissions grouped by module
 * @access  Private
 */
router.get("/", controller.getPermissions);

/**
 * @route   POST /api/permissions
 * @desc    Create a new permission (enforces module.action pattern)
 * @access  Private — requires permission.create
 */
router.post(
    "/",
    requirePermission("permission.create"),
    validateCreatePermission,
    controller.createPermission
);

module.exports = router;
