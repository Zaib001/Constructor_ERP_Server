"use strict";

const service = require("./financeSettings.service");

const getSettings = async (req, res) => {
    try {
        const data = await service.getSettings(req.user.companyId);
        const keys = service.getAvailableMappingKeys();
        res.json({ success: true, data: { settings: data, availableKeys: keys } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const updateSettings = async (req, res) => {
    try {
        const data = await service.updateSettings(req.user.companyId, req.body.settings);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getSettings,
    updateSettings
};
