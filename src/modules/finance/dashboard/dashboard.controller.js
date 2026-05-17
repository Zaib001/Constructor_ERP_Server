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

const getVATDashboard = async (req, res) => {
    try {
        const data = await dashboardService.getVATDashboard(req.user.company_id);
        res.json({ success: true, data });
    } catch (error) {
        logger.error("Error fetching VAT dashboard:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getZATCADashboard = async (req, res) => {
    try {
        const data = await dashboardService.getZATCADashboard(req.user.company_id);
        res.json({ success: true, data });
    } catch (error) {
        logger.error("Error fetching ZATCA dashboard:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getProfitabilityKPIs = async (req, res) => {
    try {
        const data = await dashboardService.getProfitabilityKPIs(req.user.company_id);
        res.json({ success: true, data });
    } catch (error) {
        logger.error("Error fetching Profitability KPIs:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSummary,
    getReceivablesAging,
    getPayablesAging,
    getVATDashboard,
    getZATCADashboard,
    getProfitabilityKPIs
};
