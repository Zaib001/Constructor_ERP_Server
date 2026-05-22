"use strict";

const service = require("./reports.service");

async function projectHealth(req, res, next) {
    try {
        const data = await service.getProjectHealthReport(req.user.companyId, req.query);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function costOverrun(req, res, next) {
    try {
        const data = await service.getCostOverrunReport(req.user.companyId, req.query);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function procurementDelays(req, res, next) {
    try {
        const data = await service.getProcurementDelayReport(req.user.companyId, req.query);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function assetUtilization(req, res, next) {
    try {
        const data = await service.getAssetUtilizationReport(req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function executiveKPIs(req, res, next) {
    try {
        const data = await service.getExecutiveKPIs(req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

module.exports = { projectHealth, costOverrun, procurementDelays, assetUtilization, executiveKPIs };
