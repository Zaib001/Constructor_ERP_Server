"use strict";

const service = require("./mobilization.service");
const { createMobilizationSchema, listFiltersSchema } = require("./mobilization.validation");

async function createMobilization(req, res, next) {
    try {
        const { error, value } = createMobilizationSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                details: error.details.map((d) => d.message)
            });
        }
        const result = await service.createMobilization(value, req.user, req.ip, req.headers["user-agent"]);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function verifyMobilization(req, res, next) {
    try {
        const result = await service.verifyMobilization(req.params.id, req.user, req.ip, req.headers["user-agent"]);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function getMobilizations(req, res, next) {
    try {
        const { error, value } = listFiltersSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.getMobilizations(req.user, value);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createMobilization,
    getMobilizations,
    verifyMobilization
};
