"use strict";

const { body, query, validationResult } = require("express-validator");

const VALID_DOC_TYPES = [
    "PR", "RFQ", "PO", "GRN", "MATERIAL_ISSUE",
    "AP_INVOICE", "CLIENT_INVOICE", "PAYMENT", "PAYROLL_RUN", "RA_BILL",
];

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

// ─── Request Approval ─────────────────────────────────────────────────────────

const validateRequestApproval = [
    body("docType")
        .trim()
        .notEmpty().withMessage("docType is required")
        .toUpperCase()
        .isIn(VALID_DOC_TYPES)
        .withMessage(`docType must be one of: ${VALID_DOC_TYPES.join(", ")}`),

    body("docId")
        .trim()
        .notEmpty().withMessage("docId is required")
        .isString().withMessage("docId must be a string"),

    body("projectId")
        .trim()
        .notEmpty().withMessage("projectId is required")
        .isUUID().withMessage("projectId must be a valid UUID"),

    body("amount")
        .notEmpty().withMessage("amount is required")
        .isNumeric().withMessage("amount must be a number")
        .custom((v) => {
            if (Number(v) < 0) throw new Error("amount cannot be negative");
            return true;
        }),

    body("department")
        .optional()
        .trim()
        .isString().withMessage("department must be a string"),

    handleValidationErrors,
];

// ─── Approve Step ─────────────────────────────────────────────────────────────

const validateApproveStep = [
    body("remarks")
        .optional()
        .trim()
        .isString().withMessage("remarks must be a string")
        .isLength({ max: 1000 }).withMessage("remarks too long (max 1000 chars)"),

    handleValidationErrors,
];

// ─── Reject Step ──────────────────────────────────────────────────────────────

const validateRejectStep = [
    body("remarks")
        .trim()
        .notEmpty().withMessage("Rejection reason (remarks) is required")
        .isLength({ max: 1000 }).withMessage("remarks too long (max 1000 chars)"),

    handleValidationErrors,
];

// ─── Inbox Query ──────────────────────────────────────────────────────────────

const validateInboxQuery = [
    query("status")
        .optional()
        .trim()
        .isIn(["pending", "approved", "rejected", "skipped", "sent", "all_sent"])
        .withMessage("status must be pending | approved | rejected | skipped | sent | all_sent"),

    handleValidationErrors,
];

// ─── History Query ────────────────────────────────────────────────────────────

const validateHistoryQuery = [
    query("docType")
        .trim()
        .notEmpty().withMessage("docType is required")
        .toUpperCase()
        .isIn(VALID_DOC_TYPES)
        .withMessage(`docType must be one of: ${VALID_DOC_TYPES.join(", ")}`),

    query("docId")
        .trim()
        .notEmpty().withMessage("docId is required")
        .isUUID().withMessage("docId must be a valid UUID"),

    handleValidationErrors,
];

module.exports = {
    validateRequestApproval,
    validateApproveStep,
    validateRejectStep,
    validateInboxQuery,
    validateHistoryQuery,
    VALID_DOC_TYPES,
};
