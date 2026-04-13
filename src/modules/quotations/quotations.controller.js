"use strict";

const quotationsService = require("./quotations.service");
const logger = require("../../logger");

async function getAllQuotations(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await quotationsService.getAllQuotations(req.user, p, ps);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error("Error in getAllQuotations:", err);
        next(err);
    }
}

async function getQuotationById(req, res, next) {
    try {
        const quote = await quotationsService.getQuotationById(req.params.id, req.user);
        if (!quote) return res.status(404).json({ success: false, message: "Quotation not found" });
        return res.status(200).json({ success: true, data: quote });
    } catch (err) {
        logger.error("Error in getQuotationById:", err);
        next(err);
    }
}

async function createQuotation(req, res, next) {
    try {
        const data = {
            ...req.body,
            company_id: req.user.roleCode === "super_admin" ? req.body.company_id : req.user.companyId
        };
        const quote = await quotationsService.createQuotation(data, req.user.id, req.user.department_id);
        return res.status(201).json({ success: true, data: quote });
    } catch (err) {
        logger.error("Error in createQuotation:", err);
        next(err);
    }
}

module.exports = { getAllQuotations, getQuotationById, createQuotation };
