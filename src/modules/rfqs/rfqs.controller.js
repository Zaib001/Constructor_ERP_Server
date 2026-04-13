"use strict";
const service = require("./rfqs.service");
const logger = require("../../logger");

async function getAllRFQs(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllRFQs(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllRFQs error", error);
        next(error);
    }
}

async function getRFQById(req, res, next) {
    try {
        const result = await service.getRFQById(req.params.id, req.user);
        if (!result) return res.status(404).json({ success: false, message: "RFQ not found" });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getRFQById error", error);
        next(error);
    }
}

async function createRFQ(req, res, next) {
    try {
        const result = await service.createRFQ(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("createRFQ error", error);
        next(error);
    }
}

async function addVendors(req, res, next) {
    try {
        const result = await service.addVendors(req.params.id, req.body.vendorIds);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("addVendors error", error);
        next(error);
    }
}

async function submitQuote(req, res, next) {
    try {
        const result = await service.submitQuote(req.params.id, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("submitQuote error", error);
        next(error);
    }
}

async function compareQuotes(req, res, next) {
    try {
        const result = await service.compareQuotes(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("compareQuotes error", error);
        next(error);
    }
}

module.exports = { getAllRFQs, getRFQById, createRFQ, addVendors, submitQuote, compareQuotes };
