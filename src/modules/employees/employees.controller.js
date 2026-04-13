"use strict";

const employeesService = require("./employees.service");
const logger = require("../../logger");

async function getAllEmployees(req, res, next) {
    try {
        const { projectId, departmentId, page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await employeesService.getAllEmployees(req.user, projectId, departmentId, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllEmployees:", err);
        next(err);
    }
}

async function getEmployeeById(req, res, next) {
    try {
        const employee = await employeesService.getEmployeeById(req.params.id, req.user);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found or access denied" });
        return res.status(200).json({ success: true, data: employee });
    } catch (err) {
        logger.error("Error in getEmployeeById:", err);
        next(err);
    }
}

async function createEmployee(req, res, next) {
    try {
        const employee = await employeesService.createEmployee(req.body, req.user);
        return res.status(201).json({ success: true, data: employee });
    } catch (err) {
        logger.error("Error in createEmployee:", err);
        next(err);
    }
}

async function updateEmployee(req, res, next) {
    try {
        const employee = await employeesService.updateEmployee(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: employee });
    } catch (err) {
        logger.error("Error in updateEmployee:", err);
        next(err);
    }
}

async function deleteEmployee(req, res, next) {
    try {
        await employeesService.deleteEmployee(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Employee archived successfully" });
    } catch (err) {
        logger.error("Error in deleteEmployee:", err);
        next(err);
    }
}

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee
};
