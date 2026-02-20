"use strict";

const { Router } = require("express");
const controller = require("./auth.controller");
const {
    validateRegister,
    validateLogin,
    validateChangePassword,
    validateResetRequest,
    validateReset,
} = require("./auth.validation");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Create a new user (Admin only — requires user.create permission)
 * @access  Private
 */
router.post(
    "/register",
    authenticateJWT,
    requirePermission("user.register"),
    validateRegister,
    controller.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and issue JWT
 * @access  Public
 */
router.post("/login", validateLogin, controller.login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile and permissions
 * @access  Private
 */
router.get("/me", authenticateJWT, controller.getMe);

/**
 * @route   POST /api/auth/logout
 * @desc    Invalidate current session
 * @access  Private
 */
router.post("/logout", authenticateJWT, controller.logout);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change authenticated user's password
 * @access  Private
 */
router.post(
    "/change-password",
    authenticateJWT,
    validateChangePassword,
    controller.changePassword
);

/**
 * @route   POST /api/auth/request-reset
 * @desc    Request a password reset token (sent via email in production)
 * @access  Public
 */
router.post("/request-reset", validateResetRequest, controller.requestPasswordReset);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using a valid reset token
 * @access  Public
 */
router.post("/reset-password", validateReset, controller.resetPassword);

module.exports = router;
