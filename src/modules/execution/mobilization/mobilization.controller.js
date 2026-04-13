"use strict";

const svc = require("./mobilization.service");

exports.listLogs = async (req, res) => {
    try {
        const data = await svc.listMobilizationLogs(req.query.project_id, req.user.company_id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createLog = async (req, res) => {
    try {
        const data = await svc.createMobilizationLog(req.body, req.user);
        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const data = await svc.updateMobilizationStatus(req.params.id, req.body);
        res.json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
