"use strict";

const payrollService = require("./payroll.service");
const logger = require("../../logger");

async function getAllPayrolls(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await payrollService.getAllPayrolls(req.user, p, ps);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error("Error in getAllPayrolls:", err);
        next(err);
    }
}

async function getPayrollById(req, res, next) {
    try {
        const payroll = await payrollService.getPayrollById(req.params.id, req.user);
        if (!payroll) return res.status(404).json({ success: false, message: "Payroll not found" });
        return res.status(200).json({ success: true, data: payroll });
    } catch (err) {
        logger.error("Error in getPayrollById:", err);
        next(err);
    }
}

async function createPayroll(req, res, next) {
    try {
        const payroll = await payrollService.createPayroll(req.body, req.user);
        return res.status(201).json({ success: true, data: payroll });
    } catch (err) {
        logger.error("Error in createPayroll:", err);
        next(err);
    }
}

module.exports = { getAllPayrolls, getPayrollById, createPayroll };
