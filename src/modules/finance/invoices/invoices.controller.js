"use strict";

const invoicesService = require("./invoices.service");
const logger = require("../../../logger");

const getInvoices = async (req, res) => {
    try {
        const invoices = await invoicesService.getInvoices(req.user.company_id, req.query);
        res.json({ success: true, data: invoices });
    } catch (error) {
        logger.error("Error fetching invoices:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createInvoice = async (req, res) => {
    try {
        const invoice = await invoicesService.createInvoice(req.user.company_id, req.body, req.user.id);
        res.status(201).json({ success: true, data: invoice });
    } catch (error) {
        logger.error("Error creating invoice:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const postInvoice = async (req, res) => {
    try {
        const invoice = await invoicesService.postInvoice(req.params.id, req.user.company_id, req.user.id);
        res.json({ success: true, data: invoice });
    } catch (error) {
        logger.error("Error posting invoice:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getInvoices,
    createInvoice,
    postInvoice
};
