"use strict";

const usersService = require("./users.service");
const logger = require("../../logger");

/**
 * Controller: Get all users.
 */
async function getAllUsers(req, res, next) {
    try {
        const users = await usersService.getAllUsers();

        // Map to the format the frontend expects if necessary, 
        // though findMany include already does most of the heavy lifting.
        const formatted = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            department: u.department,
            designation: u.designation,
            employee_code: u.employee_code,
            role: u.roles, // Nested object { id, name, code }
            is_active: u.is_active
        }));

        return res.status(200).json({
            success: true,
            data: formatted
        });
    } catch (err) {
        logger.error("Error in getAllUsers controller:", err);
        next(err);
    }
}

/**
 * Controller: Get user by ID.
 */
async function getUserById(req, res, next) {
    try {
        const user = await usersService.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Controller: Update user.
 */
async function updateUser(req, res, next) {
    try {
        const user = await usersService.updateUser(req.params.id, req.body);
        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        logger.error(`Error updating user ${req.params.id}:`, err);
        next(err);
    }
}

/**
 * Controller: Delete user.
 */
async function deleteUser(req, res, next) {
    try {
        await usersService.deleteUser(req.params.id);
        return res.status(200).json({
            success: true,
            message: "User deleted successfully"
        });
    } catch (err) {
        logger.error(`Error deleting user ${req.params.id}:`, err);
        next(err);
    }
}

module.exports = {
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
};
