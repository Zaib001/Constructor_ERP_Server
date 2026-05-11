"use strict";

const { createWorkOrderSchema, updateWorkOrderSchema, listFiltersSchema } = require("./workOrders.validation");

async function createWorkOrder(req, res, next) {
    try {
        const { error, value } = createWorkOrderSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                details: error.details.map((d) => d.message)
            });
        }
        const result = await service.createWorkOrder(value, req.user, req.ip, req.headers["user-agent"]);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function getWorkOrders(req, res, next) {
    try {
        const { error, value } = listFiltersSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.getWorkOrders(req.user, value);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}

async function getWorkOrderById(req, res, next) {
    try {
        const result = await service.getWorkOrderById(req.params.id, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function submitWorkOrder(req, res, next) {
    try {
        const result = await service.submitWorkOrder(req.params.id, req.user, req.ip, req.headers["user-agent"]);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}

async function updateWorkOrder(req, res, next) {
    try {
        const { error, value } = updateWorkOrderSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                details: error.details.map((d) => d.message)
            });
        }
        const result = await service.updateWorkOrder(req.params.id, value, req.user, req.ip, req.headers["user-agent"]);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createWorkOrder,
    getWorkOrders,
    getWorkOrderById,
    submitWorkOrder,
    updateWorkOrder
};
