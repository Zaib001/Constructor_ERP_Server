"use strict";

const vatService = require("./vat.service");

const getConfigs = async (req, res, next) => {
    try {
        const data = await vatService.getTaxConfigs(req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const createConfig = async (req, res, next) => {
    try {
        const data = await vatService.createTaxConfig(req.user.companyId, req.body);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
};

const updateConfig = async (req, res, next) => {
    try {
        const data = await vatService.updateTaxConfig(req.params.id, req.user.companyId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const getSummary = async (req, res, next) => {
    try {
        const data = await vatService.getVATSummary(req.user.companyId, req.query.periodId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const getTransactions = async (req, res, next) => {
    try {
        const data = await vatService.getVATTransactions(req.user.companyId, {
            direction: req.query.direction,
            periodId:  req.query.periodId,
            page:      parseInt(req.query.page)  || 1,
            limit:     parseInt(req.query.limit) || 50,
        });
        res.json({ success: true, ...data });
    } catch (err) { next(err); }
};

const getFilingData = async (req, res, next) => {
    try {
        const data = await vatService.getVATFiling(req.user.companyId, req.params.periodId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const createAdjustment = async (req, res, next) => {
    try {
        const data = await vatService.recordVATAdjustment(req.user.companyId, req.body, req.user.id);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
};

const getReturnSummary = async (req, res, next) => {
    try {
        const data = await vatService.getVATReturnSummary(req.user.companyId, req.query.periodId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const closePeriod = async (req, res, next) => {
    try {
        const data = await vatService.closeVATPeriod(req.user.companyId, req.body.periodId, req.user.id);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const getReturnsHistory = async (req, res, next) => {
    try {
        const data = await vatService.getVATFilingsHistory(req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

module.exports = { 
    getConfigs, 
    createConfig, 
    updateConfig, 
    getSummary, 
    getTransactions, 
    getFilingData,
    createAdjustment,
    getReturnSummary,
    closePeriod,
    getReturnsHistory
};
