"use strict";

const receiptsService = require("./receipts.service");
const logger = require("../../../logger");

const getReceipts = async (req, res) => {
    try {
        const receipts = await receiptsService.getReceipts(req.user.company_id, req.query);
        res.json({ success: true, data: receipts });
    } catch (error) {
        logger.error("Error fetching receipts:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const recordReceipt = async (req, res) => {
    try {
        const receipt = await receiptsService.recordReceipt(req.user.company_id, req.body, req.user.id);
        res.status(201).json({ success: true, data: receipt });
    } catch (error) {
        logger.error("Error recording receipt:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getReceipts,
    recordReceipt
};
