"use strict";

const svc = require("./delivery.service");

exports.listDeliveries = async (req, res) => {
    try {
        const data = await svc.listDeliveries(req.query.project_id, req.user.company_id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createTracking = async (req, res) => {
    try {
        const data = await svc.createTrackingEntry(req.body, req.user);
        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const data = await svc.updateStatus(req.params.id, req.body);
        res.json({ success: true, data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
