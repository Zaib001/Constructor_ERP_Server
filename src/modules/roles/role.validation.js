"use strict";

const { body, validationResult } = require("express-validator");

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

const validateCreateRole = [
    body("name")
        .trim()
        .notEmpty().withMessage("Role name is required")
        .isLength({ max: 100 }).withMessage("Name must be at most 100 characters"),

    body("code")
        .trim()
        .notEmpty().withMessage("Role code is required")
        .isLength({ max: 50 }).withMessage("Code must be at most 50 characters")
        .matches(/^[A-Za-z0-9_-]+$/).withMessage("Code may only contain letters, numbers, hyphens, and underscores"),

    body("description")
        .optional()
        .trim(),

    handleValidationErrors,
];

const validateUpdateRole = [
    body("name")
        .optional()
        .trim()
        .notEmpty().withMessage("Name cannot be blank")
        .isLength({ max: 100 }).withMessage("Name must be at most 100 characters"),

    body("description")
        .optional()
        .trim(),

    body("isActive")
        .optional()
        .isBoolean().withMessage("isActive must be a boolean"),

    handleValidationErrors,
];

const validateAssignPermissions = [
    body("permissions")
        .isArray({ min: 1 }).withMessage("permissions must be a non-empty array"),

    body("permissions.*")
        .trim()
        .notEmpty().withMessage("Each permission code must be a non-empty string"),

    handleValidationErrors,
];

module.exports = { validateCreateRole, validateUpdateRole, validateAssignPermissions };
