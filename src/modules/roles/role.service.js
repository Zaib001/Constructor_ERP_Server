"use strict";

const prisma = require("../../db");
const logger = require("../../logger");
const { logAudit } = require("../../utils/auditLogger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAppError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ─── Create Role ──────────────────────────────────────────────────────────────

async function createRole(data, actorId, ipAddress, deviceInfo) {
    const { name, code, description } = data;

    // Enforce unique code (case-insensitive)
    const existing = await prisma.role.findFirst({
        where: { code: { equals: code, mode: "insensitive" }, deleted_at: null },
    });
    if (existing) {
        throw createAppError(`Role code '${code}' is already in use`, 400);
    }

    const role = await prisma.role.create({
        data: {
            name,
            code: code.toUpperCase(),
            description: description || null,
            is_system_role: false,
            is_active: true,
            created_by: actorId,
            created_at: new Date(),
        },
        select: { id: true, name: true, code: true, description: true, is_active: true, created_at: true },
    });

    await logAudit({
        userId: actorId,
        module: "roles",
        entity: "role",
        entityId: role.id,
        action: "CREATE_ROLE",
        beforeData: null,
        afterData: { name: role.name, code: role.code },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Role created: ${role.code} by ${actorId}`);
    return role;
}

// ─── Update Role ──────────────────────────────────────────────────────────────

async function updateRole(id, data, actorId, ipAddress, deviceInfo) {
    const role = await prisma.role.findFirst({ where: { id, deleted_at: null } });
    if (!role) throw createAppError("Role not found", 404);
    if (role.is_system_role) {
        throw createAppError("System roles cannot be modified", 403);
    }

    const { name, description, isActive } = data;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.is_active = isActive;
    updateData.updated_at = new Date();

    const updated = await prisma.role.update({
        where: { id },
        data: updateData,
        select: { id: true, name: true, code: true, description: true, is_active: true },
    });

    await logAudit({
        userId: actorId,
        module: "roles",
        entity: "role",
        entityId: id,
        action: "UPDATE_ROLE",
        beforeData: { name: role.name, description: role.description, is_active: role.is_active },
        afterData: updateData,
        ipAddress,
        deviceInfo,
    });

    logger.info(`Role updated: ${id} by ${actorId}`);
    return updated;
}

// ─── Delete Role (Soft) ───────────────────────────────────────────────────────

async function deleteRole(id, actorId, ipAddress, deviceInfo) {
    const role = await prisma.role.findFirst({ where: { id, deleted_at: null } });
    if (!role) throw createAppError("Role not found", 404);
    if (role.is_system_role) {
        throw createAppError("System roles cannot be deleted", 403);
    }

    // Check if any active users are still assigned this role
    const usersWithRole = await prisma.user.count({
        where: { role_id: id, deleted_at: null, is_active: true },
    });
    if (usersWithRole > 0) {
        throw createAppError(
            `Cannot delete role — ${usersWithRole} active user(s) are still assigned to it`,
            409
        );
    }

    await prisma.role.update({
        where: { id },
        data: { deleted_at: new Date(), is_active: false, updated_at: new Date() },
    });

    await logAudit({
        userId: actorId,
        module: "roles",
        entity: "role",
        entityId: id,
        action: "DELETE_ROLE",
        beforeData: { name: role.name, code: role.code },
        afterData: { deleted_at: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Role soft-deleted: ${id} by ${actorId}`);
}

// ─── Get All Roles ────────────────────────────────────────────────────────────

async function getRoles() {
    const roles = await prisma.role.findMany({
        where: { is_active: true, deleted_at: null },
        orderBy: { created_at: "asc" },
        select: {
            id: true,
            name: true,
            code: true,
            description: true,
            is_system_role: true,
            is_active: true,
            created_at: true,
            _count: { select: { role_permissions: true } },
        },
    });

    return roles.map((r) => ({
        ...r,
        permissionCount: r._count.role_permissions,
        _count: undefined,
    }));
}

// ─── Get Role By ID ───────────────────────────────────────────────────────────

async function getRoleById(id) {
    const role = await prisma.role.findFirst({
        where: { id, deleted_at: null },
        include: {
            role_permissions: {
                include: { permissions: true },
            },
        },
    });
    if (!role) throw createAppError("Role not found", 404);
    return role;
}

// ─── Assign Permissions to Role ───────────────────────────────────────────────

async function assignPermissions(roleId, permissionCodes, actorId, ipAddress, deviceInfo) {
    // Validate role exists & is not soft-deleted
    const role = await prisma.role.findFirst({ where: { id: roleId, deleted_at: null } });
    if (!role) throw createAppError("Role not found", 404);

    // Fetch permission records by code
    const permissions = await prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { id: true, code: true },
    });

    // Validate all requested codes actually exist
    const foundCodes = permissions.map((p) => p.code);
    const missing = permissionCodes.filter((c) => !foundCodes.includes(c));
    if (missing.length > 0) {
        throw createAppError(`Unknown permission code(s): ${missing.join(", ")}`, 400);
    }

    // Get current assignments to skip duplicates
    const existing = await prisma.rolePermission.findMany({
        where: { role_id: roleId },
        select: { permission_id: true },
    });
    const existingPermIds = new Set(existing.map((e) => e.permission_id));

    const newAssignments = permissions
        .filter((p) => !existingPermIds.has(p.id))
        .map((p) => ({ role_id: roleId, permission_id: p.id }));

    if (newAssignments.length > 0) {
        await prisma.$transaction(
            newAssignments.map((assignment) =>
                prisma.rolePermission.create({ data: assignment })
            )
        );
    }

    await logAudit({
        userId: actorId,
        module: "roles",
        entity: "role_permission",
        entityId: roleId,
        action: "ASSIGN_PERMISSIONS",
        beforeData: null,
        afterData: {
            role: role.name,
            added: newAssignments.length,
            skipped: permissions.length - newAssignments.length,
            codes: permissionCodes,
        },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Permissions assigned to role ${roleId}: added ${newAssignments.length}, skipped ${permissions.length - newAssignments.length}`);

    return {
        added: newAssignments.length,
        skipped: permissions.length - newAssignments.length,
        total: permissions.length,
    };
}

// ─── Get Role Permissions ─────────────────────────────────────────────────────

async function getRolePermissions(roleId) {
    const role = await prisma.role.findFirst({ where: { id: roleId, deleted_at: null } });
    if (!role) throw createAppError("Role not found", 404);

    const rolePerms = await prisma.rolePermission.findMany({
        where: { role_id: roleId },
        include: { permissions: { select: { id: true, code: true, module: true, description: true } } },
        orderBy: { permissions: { module: "asc" } },
    });

    return {
        role: { id: role.id, name: role.name, code: role.code },
        permissions: rolePerms.map((rp) => rp.permissions).filter(Boolean),
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    createRole,
    updateRole,
    deleteRole,
    getRoles,
    getRoleById,
    assignPermissions,
    getRolePermissions,
};
