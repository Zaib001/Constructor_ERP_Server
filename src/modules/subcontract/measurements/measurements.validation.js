"use strict";

const Joi = require("joi");

const createMeasurementSchema = Joi.object({
    workOrderId: Joi.string().uuid().required(),
    workOrderItemId: Joi.string().uuid().required(),
    measurementDate: Joi.date().iso().required(),
    measuredQty: Joi.number().positive().required(),
    description: Joi.string().trim().max(500).required(),
    remarks: Joi.string().trim().max(1000).allow(null, "").optional(),
    attachments: Joi.any().optional()
});

const statusUpdateSchema = Joi.object({
    status: Joi.string().valid("draft", "checked", "certified", "rejected").required(),
    remarks: Joi.string().trim().max(500).allow(null, "").optional()
});

const listFiltersSchema = Joi.object({
    projectId: Joi.string().uuid().optional(),
    workOrderId: Joi.string().uuid().optional(),
    status: Joi.string().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

module.exports = {
    createMeasurementSchema,
    statusUpdateSchema,
    listFiltersSchema
};
