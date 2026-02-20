"use strict";

const { body, validationResult } = require("express-validator");

/**
 * Centralised validation error handler.
 * Place this AFTER your validation chains in a route definition.
 */
function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
    }
    next();
}

// ─── Validation Chains ────────────────────────────────────────────────────────

const validateRegister = [
    body("employeeCode")
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage("Employee code must be at most 50 characters"),

    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required")
        .isLength({ max: 150 })
        .withMessage("Name must be at most 150 characters"),

    body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Must be a valid email address")
        .normalizeEmail(),

    body("phone")
        .optional()
        .trim()
        .isLength({ max: 30 })
        .withMessage("Phone must be at most 30 characters"),

    body("password")
        .notEmpty()
        .withMessage("Password is required")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters"),

    body("roleId")
        .optional()
        .isUUID()
        .withMessage("roleId must be a valid UUID"),

    body("department")
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Department must be at most 100 characters"),

    body("designation")
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Designation must be at most 100 characters"),

    handleValidationErrors,
];

const validateLogin = [
    body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Must be a valid email address")
        .normalizeEmail(),

    body("password")
        .notEmpty()
        .withMessage("Password is required"),

    handleValidationErrors,
];

const validateChangePassword = [
    body("oldPassword")
        .notEmpty()
        .withMessage("Old password is required"),

    body("newPassword")
        .notEmpty()
        .withMessage("New password is required")
        .isLength({ min: 8 })
        .withMessage("New password must be at least 8 characters")
        .custom((value, { req }) => {
            if (value === req.body.oldPassword) {
                throw new Error("New password must differ from old password");
            }
            return true;
        }),

    handleValidationErrors,
];

const validateResetRequest = [
    body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Must be a valid email address")
        .normalizeEmail(),

    handleValidationErrors,
];

const validateReset = [
    body("token")
        .trim()
        .notEmpty()
        .withMessage("Reset token is required"),

    body("newPassword")
        .notEmpty()
        .withMessage("New password is required")
        .isLength({ min: 8 })
        .withMessage("New password must be at least 8 characters"),

    handleValidationErrors,
];

module.exports = {
    validateRegister,
    validateLogin,
    validateChangePassword,
    validateResetRequest,
    validateReset,
};
