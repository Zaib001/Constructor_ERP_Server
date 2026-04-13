"use strict";

const settingsService = require("./settings.service");
const logger = require("../../logger");

async function getAllSettings(req, res, next) {
    try {
        const { companyId, category } = req.query;
        const settings = await settingsService.getAllSettings({ companyId, category });
        return res.status(200).json({ success: true, data: settings });
    } catch (err) {
        logger.error("Error in getAllSettings:", err);
        next(err);
    }
}

async function upsertSetting(req, res, next) {
    try {
        const { key, value, label, description, category, companyId } = req.body;
        if (!key || value === undefined) {
            return res.status(400).json({ success: false, message: "key and value are required" });
        }
        const setting = await settingsService.upsertSetting({ key, value, label, description, category, companyId });
        return res.status(200).json({ success: true, data: setting });
    } catch (err) {
        logger.error("Error in upsertSetting:", err);
        next(err);
    }
}

async function deleteSetting(req, res, next) {
    try {
        await settingsService.deleteSetting(req.params.id);
        return res.status(200).json({ success: true, message: "Setting deleted" });
    } catch (err) {
        logger.error("Error in deleteSetting:", err);
        next(err);
    }
}

module.exports = { getAllSettings, upsertSetting, deleteSetting };
