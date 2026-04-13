"use strict";

const service = require("./petrolExpenses.service");
const logger = require("../../logger");

async function getAllExpenses(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllExpenses(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllExpenses error", error);
        next(error);
    }
}

async function getExpenseById(req, res, next) {
    try {
        const result = await service.getExpenseById(req.params.id, req.user);
        if (!result) return res.status(404).json({ success: false, message: "Petrol expense not found" });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getExpenseById error", error);
        next(error);
    }
}

async function createExpense(req, res, next) {
    try {
        const result = await service.createExpense(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, message: "Duplicate Bill: This bill number already exists for your company" });
        }
        logger.error("createExpense error", error);
        next(error);
    }
}

async function updateExpense(req, res, next) {
    try {
        const result = await service.updateExpense(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("updateExpense error", error);
        next(error);
    }
}

async function verifyExpense(req, res, next) {
    try {
        const result = await service.verifyExpense(req.params.id, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("verifyExpense error", error);
        next(error);
    }
}

async function rejectExpense(req, res, next) {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: "Rejection reason is mandatory" });
        const result = await service.rejectExpense(req.params.id, reason, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("rejectExpense error", error);
        next(error);
    }
}

async function getReports(req, res, next) {
    try {
        const result = await service.getReports(req.query, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getReports error", error);
        next(error);
    }
}

module.exports = { getAllExpenses, getExpenseById, createExpense, updateExpense, verifyExpense, rejectExpense, getReports };
