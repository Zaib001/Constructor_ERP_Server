"use strict";

const service = require("./inventory.service");
const { AppError } = service;
const { createGRNSchema, createIssueSchema, stockFilterSchema, ledgerFilterSchema, grnFilterSchema, issueFilterSchema } = require("./inventory.validation");
const logger = require("../../logger");

// ─── Error Discriminator ─────────────────────────────────────────────────────
/**
 * Business errors (AppError.isOperational = true) → 400/404/422.
 * Unexpected errors → 500 via next(err) into global handler.
 */
function handleError(err, res, next, context) {
    if (err.isOperational) {
        return res.status(err.statusCode || 400).json({
            success: false,
            message: err.message
        });
    }
    logger.error(`inventory.${context}:`, { error: err.message, stack: err.stack });
    next(err);
}

// ─── GRN ─────────────────────────────────────────────────────────────────────

async function postGRN(req, res, next) {
    try {
        const { error, value } = createGRNSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                details: error.details.map((d) => d.message)
            });
        }

        const ipAddress = req.ip || req.headers["x-forwarded-for"];
        const deviceInfo = req.headers["user-agent"];

        const result = await service.createGRN(value, req.user, ipAddress, deviceInfo);
        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        return handleError(err, res, next, "postGRN");
    }
}

async function getGRNs(req, res, next) {
    try {
        const { error, value } = grnFilterSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.getGRNList(req.user, value);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        return handleError(err, res, next, "getGRNs");
    }
}

// ─── Material Issue ───────────────────────────────────────────────────────────

async function postMaterialIssue(req, res, next) {
    try {
        const { error, value } = createIssueSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                details: error.details.map((d) => d.message)
            });
        }

        const ipAddress = req.ip || req.headers["x-forwarded-for"];
        const deviceInfo = req.headers["user-agent"];

        const result = await service.createMaterialIssue(value, req.user, ipAddress, deviceInfo);
        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        return handleError(err, res, next, "postMaterialIssue");
    }
}

async function getIssues(req, res, next) {
    try {
        const { error, value } = issueFilterSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const result = await service.getIssueList(req.user, value);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        return handleError(err, res, next, "getIssues");
    }
}

// ─── Stock ────────────────────────────────────────────────────────────────────

async function getStock(req, res, next) {
    try {
        const { error, value } = stockFilterSchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }
        const result = await service.getStockSnapshot(req.user, value);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        return handleError(err, res, next, "getStock");
    }
}

// ─── Stock Ledger ─────────────────────────────────────────────────────────────

async function getLedger(req, res, next) {
    try {
        const { itemId } = req.params;
        if (!itemId) {
            return res.status(400).json({ success: false, message: "itemId param is required" });
        }

        const { error, value } = ledgerFilterSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const result = await service.getStockLedger(req.user, itemId, value);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        return handleError(err, res, next, "getLedger");
    }
}

async function getStores(req, res, next) {
    try {
        const result = await service.getStores(req.user);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return handleError(err, res, next, "getStores");
    }
}

// ─── Legacy handlers (kept for existing routes) ───────────────────────────────

async function getPRs(req, res, next) {
    try {
        const { page = 1, pageSize = 20, projectId } = req.query;
        const data = await service.getPRs(req.user, projectId, Number(page), Number(pageSize));
        return res.status(200).json({ success: true, ...data });
    } catch (err) { logger.error("inventory.getPRs:", err); next(err); }
}

async function getExcess(req, res, next) {
    try {
        const { page = 1, pageSize = 20 } = req.query;
        const data = await service.getExcess(req.user, Number(page), Number(pageSize));
        return res.status(200).json({ success: true, ...data });
    } catch (err) { logger.error("inventory.getExcess:", err); next(err); }
}

async function addStock(req, res, next) {
    try {
        const result = await service.addStock(req.user, req.body);
        return res.status(201).json({ success: true, data: result });
    } catch (err) { logger.error("inventory.addStock:", err); next(err); }
}

async function createPR(req, res, next) {
    try {
        const result = await service.createPR(req.user, req.body);
        return res.status(201).json({ success: true, data: result });
    } catch (err) { logger.error("inventory.createPR:", err); next(err); }
}

async function reportExcess(req, res, next) {
    try {
        const result = await service.reportExcess(req.user, req.body);
        return res.status(201).json({ success: true, data: result });
    } catch (err) { logger.error("inventory.reportExcess:", err); next(err); }
}

async function createStore(req, res, next) {
    try {
        const result = await service.createStore(req.user, req.body);
        return res.status(201).json({ success: true, data: result });
    } catch (err) { logger.error("inventory.createStore:", err); next(err); }
}

async function updateStore(req, res, next) {
    try {
        const result = await service.updateStore(req.user, req.params.id, req.body);
        return res.status(200).json({ success: true, data: result });
    } catch (err) { logger.error("inventory.updateStore:", err); next(err); }
}

async function deleteStore(req, res, next) {
    try {
        const result = await service.deleteStore(req.user, req.params.id);
        return res.status(200).json({ success: true, data: result });
    } catch (err) { logger.error("inventory.deleteStore:", err); next(err); }
}

module.exports = {
    postGRN,
    getGRNs,
    postMaterialIssue,
    getIssues,
    getStock,
    getLedger,
    getStores,
    createStore,
    updateStore,
    deleteStore,
    // Legacy
    getPRs,
    getExcess,
    addStock,
    createPR,
    reportExcess
};
