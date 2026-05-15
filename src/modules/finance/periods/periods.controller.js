"use strict";

const periodsService = require("./periods.service");
const logger = require("../../../logger");

const getPeriods = async (req, res) => {
    try {
        const periods = await periodsService.getPeriods(req.user.company_id);
        res.json({ success: true, data: periods });
    } catch (error) {
        logger.error("Error fetching periods:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createPeriod = async (req, res) => {
    try {
        const period = await periodsService.createPeriod(req.user.company_id, req.body);
        res.status(201).json({ success: true, data: period });
    } catch (error) {
        logger.error("Error creating period:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const updatePeriodStatus = async (req, res) => {
    try {
        const period = await periodsService.updatePeriodStatus(req.params.id, req.user.company_id, req.body.status, req.user.id);
        res.json({ success: true, data: period });
    } catch (error) {
        logger.error("Error updating period status:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const deletePeriod = async (req, res) => {
    try {
        await periodsService.deletePeriod(req.params.id, req.user.company_id);
        res.json({ success: true, message: "Period deleted successfully" });
    } catch (error) {
        logger.error("Error deleting period:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getPeriods,
    createPeriod,
    updatePeriodStatus,
    deletePeriod
};
