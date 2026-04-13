"use strict";
const service = require("./purchaseRequisitions.service");
const logger = require("../../logger");

async function getAllPRs(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllPRs(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllPRs error", error);
        next(error);
    }
}

async function getPRById(req, res, next) {
    try {
        const result = await service.getPRById(req.params.id, req.user);
        if (!result) return res.status(404).json({ success: false, message: "PR not found" });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getPRById error", error);
        next(error);
    }
}

async function createPR(req, res, next) {
    try {
        const result = await service.createPR(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("createPR error", error);
        next(error);
    }
}

async function approvePR(req, res, next) {
    try {
        const result = await service.approvePR(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("approvePR error", error);
        next(error);
    }
}

async function updatePR(req, res, next) {
    try {
        const result = await service.updatePR(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("updatePR error", error);
        next(error);
    }
}

async function submitPR(req, res, next) {
    try {
        const result = await service.submitPR(req.params.id, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("submitPR error", error);
        next(error);
    }
}

module.exports = { getAllPRs, getPRById, createPR, updatePR, submitPR, approvePR };
