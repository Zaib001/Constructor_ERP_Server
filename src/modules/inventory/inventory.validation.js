"use strict";

const Joi = require("joi");

// ─── createGRN ────────────────────────────────────────────────────────────────
const createGRNSchema = Joi.object({
    poId: Joi.string().uuid().required().messages({
        "string.uuid": "poId must be a valid UUID",
        "any.required": "poId is required"
    }),
    storeId: Joi.string().uuid().required().messages({
        "string.uuid": "storeId must be a valid UUID",
        "any.required": "storeId is required"
    }),
    vendorDn: Joi.string().trim().max(100).allow(null, "").optional(),
    remarks: Joi.string().trim().max(500).allow(null, "").optional(),
    items: Joi.array()
        .items(
            Joi.object({
                poItemId: Joi.string().uuid().required().messages({
                    "string.uuid": "poItemId must be a valid UUID",
                    "any.required": "poItemId is required"
                }),
                itemId: Joi.string().uuid().allow(null).required().messages({
                    "string.uuid": "itemId must be a valid UUID",
                    "any.required": "itemId is required"
                }),
                qtyReceived: Joi.number().positive().required().messages({
                    "number.positive": "qtyReceived must be greater than 0",
                    "any.required": "qtyReceived is required"
                }),
                qtyRejected: Joi.number().min(0).default(0)
            })
        )
        .min(1)
        .required()
        .messages({
            "array.min": "items must contain at least one line",
            "any.required": "items array is required"
        })
});

// ─── createMaterialIssue ──────────────────────────────────────────────────────
const createIssueSchema = Joi.object({
    projectId: Joi.string().uuid().required().messages({
        "string.uuid": "projectId must be a valid UUID",
        "any.required": "projectId is required"
    }),
    wbsId: Joi.string().uuid().required().messages({
        "string.uuid": "wbsId must be a valid UUID",
        "any.required": "wbsId is required"
    }),
    storeId: Joi.string().uuid().required().messages({
        "string.uuid": "storeId must be a valid UUID",
        "any.required": "storeId is required"
    }),
    items: Joi.array()
        .items(
            Joi.object({
                itemId: Joi.string().uuid().required().messages({
                    "string.uuid": "itemId must be a valid UUID",
                    "any.required": "itemId is required"
                }),
                costCodeId: Joi.string().uuid().required().messages({
                    "string.uuid": "costCodeId must be a valid UUID",
                    "any.required": "costCodeId is required per issue line"
                }),
                quantity: Joi.number().positive().required().messages({
                    "number.positive": "quantity must be greater than 0",
                    "any.required": "quantity is required"
                })
            })
        )
        .min(1)
        .required()
        .messages({
            "array.min": "items must contain at least one line",
            "any.required": "items array is required"
        })
});

// ─── Stock Query Filters ──────────────────────────────────────────────────────
const stockFilterSchema = Joi.object({
    storeId: Joi.string().uuid().optional(),
    itemId: Joi.string().uuid().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

// ─── GRN Query Filters ────────────────────────────────────────────────────────
const grnFilterSchema = Joi.object({
    poId: Joi.string().uuid().optional(),
    storeId: Joi.string().uuid().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

// ─── Issue Query Filters ──────────────────────────────────────────────────────
const issueFilterSchema = Joi.object({
    projectId: Joi.string().uuid().optional(),
    wbsId: Joi.string().uuid().optional(),
    storeId: Joi.string().uuid().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

// ─── Ledger Query Filters ─────────────────────────────────────────────────────
const ledgerFilterSchema = Joi.object({
    storeId: Joi.string().uuid().optional(),
    moveType: Joi.string()
        .valid("GRN_IN", "ISSUE_OUT", "ADJUST_IN", "ADJUST_OUT")
        .optional()
        .messages({ "any.only": "moveType must be one of GRN_IN, ISSUE_OUT, ADJUST_IN, ADJUST_OUT" }),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(50)
});

module.exports = {
    createGRNSchema,
    createIssueSchema,
    stockFilterSchema,
    ledgerFilterSchema,
    grnFilterSchema,
    issueFilterSchema
};
