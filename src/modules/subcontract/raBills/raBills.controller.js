"use strict";

const service = require("./raBills.service");
const { createRaBillSchema, listFiltersSchema } = require("./raBills.validation");

async function getPendingMeasurements(req, res, next) {
    try {
        const result = await service.getPendingMeasurements(req.params.workOrderId, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function createRaBill(req, res, next) {
    try {
        const { error, value } = createRaBillSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.createRaBill(value, req.user, req.ip, req.headers["user-agent"]);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function createRevision(req, res, next) {
    try {
        const result = await service.createRaBillRevision(req.params.id, req.user, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function submitRaBill(req, res, next) {
    try {
        const result = await service.submitRaBill(req.params.id, req.user, req.ip, req.headers["user-agent"]);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}

async function getRaBills(req, res, next) {
    try {
        const { error, value } = listFiltersSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.getRaBills(req.user, value);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}

async function getRaBillById(req, res, next) {
    try {
        const result = await service.getRaBillById(req.params.id, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getPendingMeasurements,
    createRaBill,
    createRevision,
    submitRaBill,
    getRaBills,
    getRaBillById
};
