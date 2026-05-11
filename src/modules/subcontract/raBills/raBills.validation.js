"use strict";

const Joi = require("joi");

const createRaBillSchema = Joi.object({
    workOrderId: Joi.string().uuid().required(),
    billDate: Joi.date().iso().required(),
    periodStart: Joi.date().iso().required(),
    periodEnd: Joi.date().iso().required(),
    remarks: Joi.string().trim().max(1000).allow(null, "").optional(),
    measurementIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    advanceRecovery: Joi.number().min(0).optional(),
    deductions: Joi.number().min(0).optional()
});

const listFiltersSchema = Joi.object({
    projectId: Joi.string().uuid().optional(),
    workOrderId: Joi.string().uuid().optional(),
    status: Joi.string().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

module.exports = {
    createRaBillSchema,
    listFiltersSchema
};
