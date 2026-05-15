"use strict";

const vendorPaymentsService = require("./vendorPayments.service");
const logger = require("../../../logger");

const getPayments = async (req, res) => {
    try {
        const payments = await vendorPaymentsService.getPayments(req.user.company_id, req.query);
        res.json({ success: true, data: payments });
    } catch (error) {
        logger.error("Error fetching vendor payments:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const recordPayment = async (req, res) => {
    try {
        const payment = await vendorPaymentsService.recordPayment(req.user.company_id, req.body, req.user.id);
        res.status(201).json({ success: true, data: payment });
    } catch (error) {
        logger.error("Error recording vendor payment:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getPayments,
    recordPayment
};
