"use strict";

const service = require("./payments.service");
const { createPaymentSchema, listFiltersSchema } = require("./payments.validation");

async function createPayment(req, res, next) {
    try {
        const { error, value } = createPaymentSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                details: error.details.map((d) => d.message)
            });
        }
        const result = await service.createPayment(value, req.user, req.ip, req.headers["user-agent"]);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

async function getPayments(req, res, next) {
    try {
        const { error, value } = listFiltersSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.getPayments(req.user, value);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createPayment,
    getPayments
};
