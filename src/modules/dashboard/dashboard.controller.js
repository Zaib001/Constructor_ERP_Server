"use strict";

const dashboardService = require("./dashboard.service");
const logger = require("../../logger");

async function getSuperadminDashboard(req, res, next) {
    try {
        const data = await dashboardService.getSuperadminDashboard();
        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error("Error in getSuperadminDashboard:", err);
        next(err);
    }
}

async function getCompanyHeadDashboard(req, res, next) {
    try {
        const data = await dashboardService.getCompanyHeadDashboard(req.user.companyId);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error("Error in getCompanyHeadDashboard:", err);
        next(err);
    }
}

async function getDepartmentDashboard(req, res, next) {
    try {
        const data = await dashboardService.getDeptHeadDashboard(req.user.id, req.user);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error("Error in getDepartmentDashboard:", err);
        next(err);
    }
}

async function getCompliance(req, res, next) {
    try {
        const data = await dashboardService.getComplianceDashboard(req.user);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error("Error in getCompliance:", err);
        next(err);
    }
}

async function getProjectDashboard(req, res, next) {
    try {
        const data = await dashboardService.getProjectDashboard(req.user);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error("Error in getProjectDashboard:", err);
        next(err);
    }
}

async function getWorkspaceSummary(req, res, next) {
    try {
        const data = await dashboardService.getWorkspaceSummary(req.user);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error("Error in getWorkspaceSummary:", err);
        next(err);
    }
}

module.exports = { 
    getSuperadminDashboard, 
    getCompanyHeadDashboard, 
    getDepartmentDashboard,
    getProjectDashboard,
    getCompliance,
    getWorkspaceSummary
};
