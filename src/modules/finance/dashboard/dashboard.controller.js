"use strict";

const dashboardService = require("./dashboard.service");
const logger = require("../../../logger");

const getSummary = async (req, res) => {
    try {
        const summary = await dashboardService.getSummary(req.user.company_id);
        res.json({ success: true, data: summary });
    } catch (error) {
        logger.error("Error fetching finance summary:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getReceivablesAging = async (req, res) => {
    try {
        const data = await dashboardService.getAgingReport(req.user.company_id, "AR");
        res.json({ success: true, data });
    } catch (error) {
        logger.error("Error fetching AR aging:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPayablesAging = async (req, res) => {
    try {
        const data = await dashboardService.getAgingReport(req.user.company_id, "AP");
        res.json({ success: true, data });
    } catch (error) {
        logger.error("Error fetching AP aging:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSummary,
    getReceivablesAging,
    getPayablesAging
};
