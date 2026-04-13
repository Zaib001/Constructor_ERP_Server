"use strict";
const service = require("./pettyCash.service");
const logger = require("../../logger");

async function getAllRequests(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllRequests(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllRequests error", error);
        next(error);
    }
}

async function getRequestById(req, res, next) {
    try {
        const result = await service.getRequestById(req.params.id, req.user);
        if (!result) return res.status(404).json({ success: false, message: "Request not found" });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getRequestById error", error);
        next(error);
    }
}

async function createRequest(req, res, next) {
    try {
        const result = await service.createRequest(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("createRequest error", error);
        next(error);
    }
}

async function submitExpense(req, res, next) {
    try {
        const result = await service.submitExpense(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("submitExpense error", error);
        next(error);
    }
}

async function getAllExpenses(req, res, next) {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 50;
        const result = await service.getAllExpenses(req.user, page, pageSize);
        res.status(200).json({ success: true, data: result });
    } catch (e) {
        next(e);
    }
}

async function verifyExpense(req, res, next) {
    try {
        const result = await service.verifyExpense(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (e) {
        next(e);
    }
}

module.exports = { getAllRequests, getRequestById, createRequest, submitExpense, getAllExpenses, verifyExpense };
