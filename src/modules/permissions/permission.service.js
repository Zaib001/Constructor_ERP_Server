"use strict";

const prisma = require("../../db");
const logger = require("../../logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAppError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ─── Create Permission ────────────────────────────────────────────────────────

async function createPermission(data, actorId) {
    const { code, module: mod, description } = data;

    // Enforce code uniqueness
    const existing = await prisma.permission.findUnique({ where: { code } });
    if (existing) {
        throw createAppError(`Permission code '${code}' already exists`, 400);
    }

    const permission = await prisma.permission.create({
        data: {
            code,
            module: mod,
            description: description || null,
        },
        select: { id: true, code: true, module: true, description: true, created_at: true },
    });

    logger.info(`Permission created: ${code} by ${actorId}`);
    return permission;
}

// ─── Get All Permissions (grouped by module) ──────────────────────────────────

async function getPermissions() {
    const permissions = await prisma.permission.findMany({
        orderBy: [{ module: "asc" }, { code: "asc" }],
        select: { id: true, code: true, module: true, description: true },
    });

    // Group by module
    const grouped = permissions.reduce((acc, perm) => {
        const key = perm.module || "general";
        if (!acc[key]) acc[key] = [];
        acc[key].push({ id: perm.id, code: perm.code, description: perm.description });
        return acc;
    }, {});

    // Return as array of { module, permissions[] } for clean JSON
    return Object.entries(grouped).map(([module, perms]) => ({
        module,
        permissions: perms,
    }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createPermission, getPermissions };
