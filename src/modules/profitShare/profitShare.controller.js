"use strict";

const profitShareService = require("./profitShare.service");
const logger = require("../../logger");

async function getAllRules(req, res, next) {
    try {
        const { entityType } = req.query;
        const rules = await profitShareService.getAllRules(req.user, { entityType });
        return res.status(200).json({ success: true, data: rules });
    } catch (err) {
        logger.error("Error in getAllRules:", err);
        next(err);
    }
}

async function getRuleById(req, res, next) {
    try {
        const rule = await profitShareService.getRuleById(req.params.id, req.user);
        if (!rule) return res.status(404).json({ success: false, message: "Rule not found" });
        return res.status(200).json({ success: true, data: rule });
    } catch (err) {
        logger.error("Error in getRuleById:", err);
        next(err);
    }
}

async function createRule(req, res, next) {
    try {
        const rule = await profitShareService.createRule(req.body, req.user);
        return res.status(201).json({ success: true, data: rule });
    } catch (err) {
        logger.error("Error in createRule:", err);
        next(err);
    }
}

async function updateRule(req, res, next) {
    try {
        const rule = await profitShareService.updateRule(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: rule });
    } catch (err) {
        logger.error("Error in updateRule:", err);
        next(err);
    }
}

async function deleteRule(req, res, next) {
    try {
        await profitShareService.deleteRule(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Rule deactivated" });
    } catch (err) {
        logger.error("Error in deleteRule:", err);
        next(err);
    }
}

async function calculateShare(req, res, next) {
    try {
        const { entityType, entityId } = req.query;
        if (!entityType || !entityId) {
            return res.status(400).json({ success: false, message: "entityType and entityId are required" });
        }
        const result = await profitShareService.calculateProfitShare(entityType, entityId, req.user);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error("Error in calculateShare:", err);
        next(err);
    }
}

module.exports = { getAllRules, getRuleById, createRule, updateRule, deleteRule, calculateShare };
