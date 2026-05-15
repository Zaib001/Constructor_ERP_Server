"use strict";

const payrollService = require("./payroll.service");
const logger = require("../../../logger");

const getSalarySummaries = async (req, res) => {
    try {
        const summaries = await payrollService.getSalarySummaries(req.user.company_id, req.query);
        res.json({ success: true, data: summaries });
    } catch (error) {
        logger.error("Error fetching salary summaries:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createSalarySummary = async (req, res) => {
    try {
        const summary = await payrollService.createSalarySummary(req.user.company_id, req.body);
        res.status(201).json({ success: true, data: summary });
    } catch (error) {
        logger.error("Error creating salary summary:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const finalizeSalarySummary = async (req, res) => {
    try {
        const summary = await payrollService.finalizeSalarySummary(req.params.id, req.user.company_id, req.user.id);
        res.json({ success: true, data: summary });
    } catch (error) {
        logger.error("Error finalizing salary summary:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const paySalarySummary = async (req, res) => {
    try {
        const summary = await payrollService.paySalarySummary(req.params.id, req.user.company_id, req.user.id);
        res.json({ success: true, data: summary });
    } catch (error) {
        logger.error("Error paying salary summary:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getNotifications = async (req, res) => {
    try {
        const notifications = await payrollService.getNotifications(req.user.company_id, req.user.id);
        res.json({ success: true, data: notifications });
    } catch (error) {
        logger.error("Error fetching salary notifications:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSalarySummaries,
    createSalarySummary,
    finalizeSalarySummary,
    paySalarySummary,
    getNotifications
};
