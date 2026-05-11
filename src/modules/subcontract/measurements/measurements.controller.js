"use strict";

const service = require("./measurements.service");
const { createMeasurementSchema, statusUpdateSchema, listFiltersSchema } = require("./measurements.validation");

async function createMeasurement(req, res, next) {
    try {
        const { error, value } = createMeasurementSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.createMeasurement(value, req.user, req.ip, req.headers["user-agent"]);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function createRevision(req, res, next) {
    try {
        const result = await service.createMeasurementRevision(req.params.id, req.user, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function getMeasurements(req, res, next) {
    try {
        const { error, value } = listFiltersSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.getMeasurements(req.user, value);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}

async function getMeasurementById(req, res, next) {
    try {
        const result = await service.getMeasurementById(req.params.id, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function updateStatus(req, res, next) {
    try {
        const { error, value } = statusUpdateSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.updateMeasurementStatus(
            req.params.id, 
            value.status, 
            req.user, 
            value.remarks, 
            req.ip, 
            req.headers["user-agent"]
        );
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createMeasurement,
    createRevision,
    getMeasurements,
    getMeasurementById,
    updateStatus
};
