"use strict";

const Joi = require("joi");

const createWorkOrderSchema = Joi.object({
    projectId: Joi.string().uuid().required(),
    vendorId: Joi.string().uuid().required(),
    serviceRequestId: Joi.string().uuid().allow(null).optional(),
    purchaseRequisitionId: Joi.string().uuid().allow(null).optional(),
    purchaseOrderId: Joi.string().uuid().allow(null).optional(),
    title: Joi.string().trim().max(300).required(),
    scopeOfWork: Joi.string().required(),
    wbsId: Joi.string().uuid().required(),
    costCodeId: Joi.string().uuid().required(),
    contractValue: Joi.number().precision(2).required(),
    retentionPercentage: Joi.number().min(0).max(100).default(10),
    advancePercentage: Joi.number().min(0).max(100).default(0),
    taxPercentage: Joi.number().min(0).max(100).default(0),
    taxMode: Joi.string().valid("additive", "withholding").default("withholding"),
    items: Joi.array().items(
        Joi.object({
            description: Joi.string().required(),
            contracted_qty: Joi.number().required(),
            unit: Joi.string().required(),
            rate: Joi.number().required(),
            totalAmount: Joi.number().required(),
            boqItemId: Joi.string().uuid().allow(null).optional()
        })
    ).min(1).required()
});

const updateWorkOrderSchema = createWorkOrderSchema;

const listFiltersSchema = Joi.object({
    projectId: Joi.string().uuid().optional(),
    vendorId: Joi.string().uuid().optional(),
    status: Joi.string().optional(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(20)
});

module.exports = {
    createWorkOrderSchema,
    updateWorkOrderSchema,
    listFiltersSchema
};
