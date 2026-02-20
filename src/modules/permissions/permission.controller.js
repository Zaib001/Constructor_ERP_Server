"use strict";

const permissionService = require("./permission.service");

// ─── Create Permission ────────────────────────────────────────────────────────

async function createPermission(req, res, next) {
    try {
        const permission = await permissionService.createPermission(req.body, req.user.userId);
        return res.status(201).json({
            success: true,
            message: "Permission created successfully",
            data: permission,
        });
    } catch (err) { next(err); }
}

// ─── Get Permissions (grouped by module) ──────────────────────────────────────

async function getPermissions(req, res, next) {
    try {
        const grouped = await permissionService.getPermissions();
        return res.status(200).json({ success: true, data: grouped });
    } catch (err) { next(err); }
}

module.exports = { createPermission, getPermissions };
