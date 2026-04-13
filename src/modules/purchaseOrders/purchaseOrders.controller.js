"use strict";

const purchaseOrdersService = require("./purchaseOrders.service");
const logger = require("../../logger");

const fulfillmentService = require("./fulfillment.service");
const financeService = require("./finance.service");

async function getAllPurchaseOrders(req, res, next) {
    try {
        const { page, pageSize, status } = req.query;
        // Standardize array input from common frontend libraries (axios adds [] often)
        const delivery_status = req.query.delivery_status || req.query["delivery_status[]"];
        
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await purchaseOrdersService.getAllPurchaseOrders(req.user, p, ps, { status, delivery_status });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error("Error in getAllPurchaseOrders:", err);
        next(err);
    }
}

async function getPOById(req, res, next) {
    try {
        const po = await purchaseOrdersService.getPOById(req.params.id, req.user);
        if (!po) return res.status(404).json({ success: false, message: "PO not found" });
        return res.status(200).json({ success: true, data: po });
    } catch (err) {
        logger.error("Error in getPOById:", err);
        next(err);
    }
}

async function createPO(req, res, next) {
    try {
        const data = {
            ...req.body,
            company_id: req.user.roleCode === "super_admin" ? req.body.company_id : req.user.companyId
        };
        const po = await purchaseOrdersService.createPO(data, req.user);
        return res.status(201).json({ success: true, data: po });
    } catch (err) {
        logger.error("Error in createPO:", err);
        next(err);
    }
}

async function issuePO(req, res, next) {
    try {
        const po = await purchaseOrdersService.issuePO(req.params.id, req.user.id);
        return res.status(200).json({ success: true, data: po });
    } catch (err) {
        logger.error("Error in issuePO:", err);
        next(err);
    }
}

async function recordReceipt(req, res, next) {
    try {
        const receipt = await fulfillmentService.recordReceipt({
            ...req.body,
            poId: req.params.id
        }, req.user.id);
        return res.status(201).json({ success: true, data: receipt });
    } catch (err) {
        logger.error("Error in recordReceipt:", err);
        next(err);
    }
}

async function getReceiptsByPO(req, res, next) {
    try {
        const receipts = await fulfillmentService.getReceiptsByPO(req.params.id);
        return res.status(200).json({ success: true, data: receipts });
    } catch (err) {
        logger.error("Error in getReceiptsByPO:", err);
        next(err);
    }
}

async function createInvoice(req, res, next) {
    try {
        const invoice = await financeService.createInvoice({
            ...req.body,
            poId: req.params.id
        });
        return res.status(201).json({ success: true, data: invoice });
    } catch (err) {
        logger.error("Error in createInvoice:", err);
        next(err);
    }
}

async function processPayment(req, res, next) {
    try {
        const payment = await financeService.processPayment(req.body);
        return res.status(201).json({ success: true, data: payment });
    } catch (err) {
        logger.error("Error in processPayment:", err);
        next(err);
    }
}

async function getInvoicesByPO(req, res, next) {
    try {
        const invoices = await financeService.getInvoicesByPO(req.params.id);
        return res.status(200).json({ success: true, data: invoices });
    } catch (err) {
        logger.error("Error in getInvoicesByPO:", err);
        next(err);
    }
}

module.exports = { 
    getAllPurchaseOrders, 
    getPOById, 
    createPO, 
    issuePO,
    recordReceipt,
    getReceiptsByPO,
    createInvoice,
    processPayment,
    getInvoicesByPO
};
