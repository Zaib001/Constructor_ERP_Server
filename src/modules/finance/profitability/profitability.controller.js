"use strict";

const service = require("./profitability.service");

const getDashboardData = async (req, res, next) => {
    try {
        const periodMonth = req.query.periodMonth || new Date().toISOString().slice(0, 7); // YYYY-MM
        const data = await service.getProfitDashboardCache(req.user.companyId, periodMonth);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const getProjectDrill = async (req, res, next) => {
    try {
        const periodMonth = req.query.periodMonth || new Date().toISOString().slice(0, 7);
        const data = await service.calculateProjectProfitLive(req.params.projectId, req.user.companyId, periodMonth);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const getDepartmentDrill = async (req, res, next) => {
    try {
        const periodMonth = req.query.periodMonth || new Date().toISOString().slice(0, 7);
        const data = await service.calculateDepartmentProfitLive(req.params.departmentId, req.user.companyId, periodMonth);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const triggerRecalculate = async (req, res, next) => {
    try {
        const periodMonth = req.body.periodMonth || new Date().toISOString().slice(0, 7);
        const data = await service.enqueueRecalculation(req.user.companyId, periodMonth, "manual");
        res.json({ success: true, message: "Recalculation enqueued successfully.", data });
    } catch (err) { next(err); }
};

module.exports = { getDashboardData, getProjectDrill, getDepartmentDrill, triggerRecalculate };
