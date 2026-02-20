"use strict";

const roleService = require("./role.service");

function getIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || null;
}
function getDevice(req) {
    return req.headers["user-agent"] || null;
}

// ─── Create Role ──────────────────────────────────────────────────────────────

async function createRole(req, res, next) {
    try {
        const role = await roleService.createRole(req.body, req.user.userId, getIp(req), getDevice(req));
        return res.status(201).json({ success: true, message: "Role created successfully", data: role });
    } catch (err) { next(err); }
}

// ─── Update Role ──────────────────────────────────────────────────────────────

async function updateRole(req, res, next) {
    try {
        const role = await roleService.updateRole(req.params.id, req.body, req.user.userId, getIp(req), getDevice(req));
        return res.status(200).json({ success: true, message: "Role updated successfully", data: role });
    } catch (err) { next(err); }
}

// ─── Delete Role ──────────────────────────────────────────────────────────────

async function deleteRole(req, res, next) {
    try {
        await roleService.deleteRole(req.params.id, req.user.userId, getIp(req), getDevice(req));
        return res.status(200).json({ success: true, message: "Role deleted successfully" });
    } catch (err) { next(err); }
}

// ─── Get All Roles ────────────────────────────────────────────────────────────

async function getRoles(req, res, next) {
    try {
        const roles = await roleService.getRoles();
        return res.status(200).json({ success: true, data: roles });
    } catch (err) { next(err); }
}

// ─── Get Role Permissions ─────────────────────────────────────────────────────

async function getRolePermissions(req, res, next) {
    try {
        const result = await roleService.getRolePermissions(req.params.id);
        return res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

// ─── Assign Permissions ───────────────────────────────────────────────────────

async function assignPermissions(req, res, next) {
    try {
        const result = await roleService.assignPermissions(
            req.params.id,
            req.body.permissions,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );
        return res.status(200).json({
            success: true,
            message: `Permissions updated — ${result.added} added, ${result.skipped} already assigned`,
            data: result,
        });
    } catch (err) { next(err); }
}

module.exports = { createRole, updateRole, deleteRole, getRoles, getRolePermissions, assignPermissions };
