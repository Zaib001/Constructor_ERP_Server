"use strict";

const Joi = require("joi");

const createMobilizationSchema = Joi.object({
    workOrderId: Joi.string().uuid().required(),
    mobilizationDate: Joi.date().iso().required(),
    manpowerCount: Joi.number().integer().min(0).optional(),
    equipmentDetails: Joi.string().trim().max(1000).allow(null, "").optional(),
    siteAccessStatus: Joi.string().valid("pending", "approved", "denied").optional(),
    safetyInductionDone: Joi.boolean().optional(),
    insuranceDocumentsVerified: Joi.boolean().optional(),
    remarks: Joi.string().trim().max(1000).allow(null, "").optional()
});

const listFiltersSchema = Joi.object({
    projectId: Joi.string().uuid().optional(),
    workOrderId: Joi.string().uuid().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

module.exports = {
    createMobilizationSchema,
    listFiltersSchema
};
