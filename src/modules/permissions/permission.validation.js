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

const validateCreatePermission = [
    body("code")
        .trim()
        .notEmpty().withMessage("Permission code is required")
        .matches(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
        .withMessage("Permission code must follow the pattern 'module.action' (lowercase, e.g. pr.create)"),

    body("module")
        .trim()
        .notEmpty().withMessage("Module name is required")
        .isLength({ max: 50 }).withMessage("Module must be at most 50 characters")
        .matches(/^[a-z][a-z0-9_]*$/).withMessage("Module name must be lowercase alphanumeric"),

    body("description")
        .optional()
        .trim(),

    handleValidationErrors,
];

module.exports = { validateCreatePermission };
