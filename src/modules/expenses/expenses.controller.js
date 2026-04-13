"use strict";

const expensesService = require("./expenses.service");
const logger = require("../../logger");

async function getAllExpenses(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await expensesService.getAllExpenses(req.user, p, ps);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error("Error in getAllExpenses:", err);
        next(err);
    }
}

async function getExpenseById(req, res, next) {
    try {
        const expense = await expensesService.getExpenseById(req.params.id, req.user);
        if (!expense) return res.status(404).json({ success: false, message: "Expense not found" });
        return res.status(200).json({ success: true, data: expense });
    } catch (err) {
        logger.error("Error in getExpenseById:", err);
        next(err);
    }
}

async function createExpense(req, res, next) {
    try {
        const expense = await expensesService.createExpense(req.body, req.user);
        return res.status(201).json({ success: true, data: expense });
    } catch (err) {
        logger.error("Error in createExpense:", err);
        next(err);
    }
}

module.exports = { getAllExpenses, getExpenseById, createExpense };
