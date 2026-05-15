"use strict";

const vendorBillsService = require("./vendorBills.service");
const logger = require("../../../logger");

const getBills = async (req, res) => {
    try {
        const bills = await vendorBillsService.getBills(req.user.company_id, req.query);
        res.json({ success: true, data: bills });
    } catch (error) {
        logger.error("Error fetching vendor bills:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createBill = async (req, res) => {
    try {
        const bill = await vendorBillsService.createBill(req.user.company_id, req.body, req.user.id);
        res.status(201).json({ success: true, data: bill });
    } catch (error) {
        logger.error("Error creating vendor bill:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const approveBill = async (req, res) => {
    try {
        const bill = await vendorBillsService.approveBill(req.params.id, req.user.company_id, req.user.id);
        res.json({ success: true, data: bill });
    } catch (error) {
        logger.error("Error approving vendor bill:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getBills,
    createBill,
    approveBill
};
