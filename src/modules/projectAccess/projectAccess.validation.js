"use strict";

const { body, param, validationResult } = require("express-validator");

const ACCESS_TYPES = ["full", "read_only", "approval_only"];

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

const validateAssignAccess = [
    body("userId")
        .trim()
        .notEmpty().withMessage("userId is required")
        .isUUID().withMessage("userId must be a valid UUID"),

    body("projectId")
        .trim()
        .notEmpty().withMessage("projectId is required")
        .isUUID().withMessage("projectId must be a valid UUID"),

    body("accessType")
        .trim()
        .notEmpty().withMessage("accessType is required")
        .isIn(ACCESS_TYPES)
        .withMessage(`accessType must be one of: ${ACCESS_TYPES.join(", ")}`),

    handleValidationErrors,
];

const validateUpdateAccess = [
    param("id").isUUID().withMessage("Assignment ID must be a valid UUID"),

    body("accessType")
        .trim()
        .notEmpty().withMessage("accessType is required")
        .isIn(ACCESS_TYPES)
        .withMessage(`accessType must be one of: ${ACCESS_TYPES.join(", ")}`),

    handleValidationErrors,
];

module.exports = { validateAssignAccess, validateUpdateAccess, ACCESS_TYPES };
