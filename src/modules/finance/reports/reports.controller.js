"use strict";

const service = require("./reports.service");

const getPnL = async (req, res) => {
    try {
        const data = await service.getPnL(req.user.companyId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getBalanceSheet = async (req, res) => {
    try {
        const data = await service.getBalanceSheet(req.user.companyId, req.query.date);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getTrialBalance = async (req, res) => {
    try {
        const data = await service.getTrialBalance(req.user.companyId, req.query.date);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getCashFlow = async (req, res) => {
    try {
        const data = await service.getCashFlow(req.user.companyId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getPnL,
    getBalanceSheet,
    getTrialBalance,
    getCashFlow
};
