"use strict";

const departmentsService = require("./departments.service");
const logger = require("../../logger");

/**
 * Controller: Get all active departments.
 * Scoped to user's company unless Super Admin.
 */
async function getAllDepartments(req, res, next) {
    try {
        const departments = await departmentsService.getAllDepartments(req.user);

        return res.status(200).json({
            success: true,
            data: departments
        });
    } catch (err) {
        logger.error("Error in getAllDepartments controller:", err);
        next(err);
    }
}

/**
 * Controller: Get single department with details.
 */
async function getDepartmentById(req, res, next) {
    try {
        const dept = await departmentsService.getDepartmentById(req.params.id, req.user);
        if (!dept) return res.status(404).json({ success: false, message: "Department not found or access denied" });
        
        return res.status(200).json({ success: true, data: dept });
    } catch (err) {
        logger.error("Error in getDepartmentById controller:", err);
        next(err);
    }
}

/**
 * Controller: Create a new department.
 */
async function createDepartment(req, res, next) {
    try {
        const { isSuperAdmin, companyId: userCompanyId } = req.user;
        
        // Non-superadmins must create departments for their own company
        const targetCompanyId = isSuperAdmin 
            ? (req.body.companyId || req.body.company_id || userCompanyId) 
            : userCompanyId;

        if (!targetCompanyId) {
            return res.status(400).json({ success: false, message: "Company allocation required" });
        }

        const department = await departmentsService.createDepartment(req.body, targetCompanyId);
        return res.status(201).json({
            success: true,
            data: department
        });
    } catch (err) {
        logger.error("Error in createDepartment controller:", err);
        next(err);
    }
}

/**
 * Controller: Update a department.
 */
async function updateDepartment(req, res, next) {
    try {
        const department = await departmentsService.updateDepartment(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: department });
    } catch (err) {
        logger.error("Error in updateDepartment controller:", err);
        next(err);
    }
}

/**
 * Controller: Delete (soft-delete) a department.
 */
async function deleteDepartment(req, res, next) {
    try {
        await departmentsService.deleteDepartment(req.params.id, req.user);
        return res.status(200).json({
            success: true,
            message: "Department deactivated successfully"
        });
    } catch (err) {
        logger.error("Error in deleteDepartment controller:", err);
        next(err);
    }
}

module.exports = {
    getAllDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment
};
