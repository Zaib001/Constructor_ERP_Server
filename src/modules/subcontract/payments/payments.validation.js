"use strict";

const Joi = require("joi");

const createPaymentSchema = Joi.object({
    raBillId: Joi.string().uuid().required(),
    paymentDate: Joi.date().iso().required(),
    amountPaid: Joi.number().positive().required(),
    paymentMethod: Joi.string().valid("cash", "bank_transfer", "cheque").required(),
    referenceNo: Joi.string().trim().max(100).required(),
    financeTransactionId: Joi.string().trim().max(100).allow(null).optional(),
    remarks: Joi.string().trim().max(500).allow(null, "").optional()
});

const listFiltersSchema = Joi.object({
    projectId: Joi.string().uuid().optional(),
    raBillId: Joi.string().uuid().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

module.exports = {
    createPaymentSchema,
    listFiltersSchema
};
