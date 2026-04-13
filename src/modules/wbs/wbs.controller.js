"use strict";

const wbsService = require("./wbs.service");
const logger = require("../../logger");

async function getAllWBS(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { projectId, page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await wbsService.getAllWBS(req.user, projectId, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllWBS:", err);
        next(err);
    }
}

async function getWBSById(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const wbs = await wbsService.getWBSById(req.params.id, req.user);
        if (!wbs) return res.status(404).json({ success: false, message: "WBS node not found or access denied" });
        return res.status(200).json({ success: true, data: wbs });
    } catch (err) {
        logger.error("Error in getWBSById:", err);
        next(err);
    }
}

async function createWBS(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const wbs = await wbsService.createWBS(req.body, req.user);
        return res.status(201).json({ success: true, data: wbs });
    } catch (err) {
        logger.error("Error in createWBS:", err);
        next(err);
    }
}

async function updateWBS(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const wbs = await wbsService.updateWBS(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: wbs });
    } catch (err) {
        logger.error("Error in updateWBS:", err);
        next(err);
    }
}

async function deleteWBS(req, res, next) {
    try {
        const companyId = req.user.companyId;
        await wbsService.deleteWBS(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "WBS node archived successfully" });
    } catch (err) {
        logger.error("Error in deleteWBS:", err);
        next(err);
    }
}

async function createCostCode(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const costCode = await wbsService.createCostCode(req.body, req.user);
        return res.status(201).json({ success: true, data: costCode });
    } catch (err) {
        logger.error("Error in createCostCode:", err);
        next(err);
    }
}

async function deleteCostCode(req, res, next) {
    try {
        const companyId = req.user.companyId;
        await wbsService.deleteCostCode(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Cost Code archived successfully" });
    } catch (err) {
        logger.error("Error in deleteCostCode:", err);
        next(err);
    }
}

async function updateCostCodeBudget(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { budget_amount } = req.body;
        const costCode = await wbsService.updateCostCodeBudget(req.params.id, budget_amount, req.user);
        return res.status(200).json({ success: true, data: costCode });
    } catch (err) {
        logger.error("Error in updateCostCodeBudget:", err);
        next(err);
    }
}

module.exports = {
    getAllWBS,
    getWBSById,
    createWBS,
    updateWBS,
    deleteWBS,
    createCostCode,
    deleteCostCode,
    updateCostCodeBudget
};
