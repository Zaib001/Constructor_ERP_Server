"use strict";

const taxService = require("./tax.service");
const logger = require("../../../logger");

const getTaxConfigs = async (req, res) => {
    try {
        const configs = await taxService.getTaxConfigs(req.user.company_id);
        res.json({ success: true, data: configs });
    } catch (error) {
        logger.error("Error fetching tax configs:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createTaxConfig = async (req, res) => {
    try {
        const config = await taxService.createTaxConfig(req.user.company_id, req.body);
        res.status(201).json({ success: true, data: config });
    } catch (error) {
        logger.error("Error creating tax config:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateTaxConfig = async (req, res) => {
    try {
        const config = await taxService.updateTaxConfig(req.params.id, req.user.company_id, req.body);
        res.json({ success: true, data: config });
    } catch (error) {
        logger.error("Error updating tax config:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getTaxConfigs,
    createTaxConfig,
    updateTaxConfig
};
