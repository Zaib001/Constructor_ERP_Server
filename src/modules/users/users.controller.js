"use strict";

const usersService = require("./users.service");
const logger = require("../../logger");

async function createUser(req, res, next) {
    try {
        const newUser = await usersService.createUser(req.body, req.user);
        return res.status(201).json({ success: true, message: "User created successfully", data: newUser });
    } catch (err) { logger.error("createUser:", err); next(err); }
}

async function getAllUsers(req, res, next) {
    try {
        const users = await usersService.getAllUsers(req.user);
        const formatted = users.map(u => ({
            id: u.id, name: u.name, email: u.email,
            department_id: u.department_id, designation: u.designation,
            employee_code: u.employee_code, role: u.roles, is_active: u.is_active
        }));
        return res.status(200).json({ success: true, data: formatted });
    } catch (err) { logger.error("getAllUsers:", err); next(err); }
}

async function getUserById(req, res, next) {
    try {
        const user = await usersService.getUserById(req.params.id, req.user);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        return res.status(200).json({ success: true, data: user });
    } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
    try {
        const user = await usersService.updateUser(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: user });
    } catch (err) { logger.error("updateUser:", err); next(err); }
}

async function deleteUser(req, res, next) {
    try {
        await usersService.deleteUser(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "User deleted successfully" });
    } catch (err) { logger.error("deleteUser:", err); next(err); }
}

async function listUsers(req, res, next) {
    try {
        const { search = "", role = "", page = 1, limit = 20 } = req.query;
        const pageNum  = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, parseInt(limit, 10) || 20);
        const result = await usersService.listUsers(req.user, { search, role, page: pageNum, limit: pageSize });
        return res.status(200).json({ success: true, total: result.total, page: result.page, limit: result.limit, users: result.users });
    } catch (err) {
        if (err.statusCode === 403) return res.status(403).json({ success: false, message: err.message });
        next(err);
    }
}

async function getUserProjects(req, res, next) {
    try {
        const { userId } = req.params;
        const projects = await usersService.getUserProjects(userId, req.user);
        return res.status(200).json({ success: true, data: { userId, projects } });
    } catch (err) {
        if (err.statusCode === 403) return res.status(403).json({ success: false, message: err.message });
        next(err);
    }
}

async function assignProjectAccess(req, res, next) {
    try {
        const { userId, projectId, role } = req.body;
        if (!userId || !projectId || !role) {
            return res.status(400).json({ success: false, message: "userId, projectId and role are required." });
        }
        const result = await usersService.assignProjectAccess(req.user, { userId, projectId, role });
        return res.status(201).json({ success: true, message: "User assigned to project.", data: result });
    } catch (err) {
        const code = err.statusCode;
        if (code === 409 || code === 404 || code === 400 || code === 403) {
            return res.status(code).json({ success: false, message: err.message });
        }
        next(err);
    }
}

async function removeProjectAccess(req, res, next) {
    try {
        const { userId, projectId } = req.body;
        if (!userId || !projectId) {
            return res.status(400).json({ success: false, message: "userId and projectId are required." });
        }
        await usersService.removeProjectAccess(req.user, { userId, projectId });
        return res.status(200).json({ success: true, message: "User removed from project." });
    } catch (err) {
        const code = err.statusCode;
        if (code === 404 || code === 403) return res.status(code).json({ success: false, message: err.message });
        next(err);
    }
}

module.exports = {
    createUser, getAllUsers, getUserById, updateUser, deleteUser,
    listUsers, getUserProjects, assignProjectAccess, removeProjectAccess,
};
