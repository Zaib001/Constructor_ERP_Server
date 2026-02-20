"use strict";

const prisma = require("../../db");
const logger = require("../../logger");
const { logAudit } = require("../../utils/auditLogger");

const ACCESS_TYPES = ["full", "read_only", "approval_only"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAppError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ─── Assign User to Project ───────────────────────────────────────────────────

async function assignAccess(data, actorId, ipAddress, deviceInfo) {
    const { userId, projectId, accessType } = data;

    // Prevent self-assignment
    if (userId === actorId) {
        throw createAppError("You cannot assign project access to yourself", 403);
    }

    // Validate user exists and is active
    const user = await prisma.user.findFirst({
        where: { id: userId, deleted_at: null, is_active: true },
        select: { id: true, name: true, email: true },
    });
    if (!user) {
        throw createAppError("User not found or inactive", 404);
    }

    // Check for an existing active (non-revoked) assignment to the same project
    const existing = await prisma.userProject.findFirst({
        where: { user_id: userId, project_id: projectId, revoked_at: null },
    });
    if (existing) {
        throw createAppError(
            `User already has '${existing.access_type}' access to this project. Revoke it first or update it.`,
            409
        );
    }

    const assignment = await prisma.userProject.create({
        data: {
            user_id: userId,
            project_id: projectId,
            access_type: accessType,
            assigned_by: actorId,
            assigned_at: new Date(),
        },
        select: {
            id: true,
            user_id: true,
            project_id: true,
            access_type: true,
            assigned_by: true,
            assigned_at: true,
        },
    });

    await logAudit({
        userId: actorId,
        module: "project_access",
        entity: "user_project",
        entityId: assignment.id,
        action: "ASSIGN_ACCESS",
        beforeData: null,
        afterData: { userId, projectId, accessType },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Project access assigned: user=${userId} project=${projectId} type=${accessType} by=${actorId}`);
    return { ...assignment, user };
}

// ─── Update Access Level ──────────────────────────────────────────────────────

async function updateAccess(id, accessType, actorId, ipAddress, deviceInfo) {
    const assignment = await prisma.userProject.findFirst({
        where: { id, revoked_at: null },
        select: {
            id: true, user_id: true, project_id: true, access_type: true, assigned_by: true,
        },
    });
    if (!assignment) {
        throw createAppError("Assignment not found or already revoked", 404);
    }

    const oldType = assignment.access_type;

    const updated = await prisma.userProject.update({
        where: { id },
        data: { access_type: accessType },
        select: { id: true, user_id: true, project_id: true, access_type: true },
    });

    await logAudit({
        userId: actorId,
        module: "project_access",
        entity: "user_project",
        entityId: id,
        action: "UPDATE_ACCESS",
        beforeData: { access_type: oldType },
        afterData: { access_type: accessType },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Project access updated: id=${id} from=${oldType} to=${accessType} by=${actorId}`);
    return updated;
}

// ─── Revoke Access ────────────────────────────────────────────────────────────

async function revokeAccess(id, actorId, ipAddress, deviceInfo) {
    const assignment = await prisma.userProject.findFirst({
        where: { id, revoked_at: null },
        select: { id: true, user_id: true, project_id: true, access_type: true },
    });
    if (!assignment) {
        throw createAppError("Assignment not found or already revoked", 404);
    }

    await prisma.userProject.update({
        where: { id },
        data: { revoked_at: new Date() },
    });

    await logAudit({
        userId: actorId,
        module: "project_access",
        entity: "user_project",
        entityId: id,
        action: "REVOKE_ACCESS",
        beforeData: { user_id: assignment.user_id, project_id: assignment.project_id, access_type: assignment.access_type },
        afterData: { revoked_at: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Project access revoked: id=${id} by=${actorId}`);
}

// ─── Get Projects for a User ──────────────────────────────────────────────────

async function getUserProjects(userId) {
    // Validate user exists
    const user = await prisma.user.findFirst({ where: { id: userId, deleted_at: null } });
    if (!user) throw createAppError("User not found", 404);

    const assignments = await prisma.userProject.findMany({
        where: { user_id: userId, revoked_at: null },
        orderBy: { assigned_at: "desc" },
        include: {
            projects: {
                select: {
                    id: true,
                    name: true,
                    code: true
                }
            }
        }
    });

    return {
        user: { id: user.id, name: user.name, email: user.email },
        projects: assignments.map(a => ({
            id: a.id,
            project_id: a.project_id,
            name: a.projects?.name || "Site Asset",
            code: a.projects?.code,
            access_type: a.access_type,
            assigned_at: a.assigned_at
        })),
    };
}

// ─── Get Users for a Project ──────────────────────────────────────────────────

async function getProjectUsers(projectId) {
    const assignments = await prisma.userProject.findMany({
        where: { project_id: projectId, revoked_at: null },
        orderBy: { assigned_at: "desc" },
        include: {
            users: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    designation: true,
                    department: true,
                    roles: { select: { name: true, code: true } },
                },
            },
        },
    });

    return assignments.map((a) => ({
        assignmentId: a.id,
        accessType: a.access_type,
        assignedAt: a.assigned_at,
        user: a.users,
    }));
}

// ─── Get All Assignments (Admin) ──────────────────────────────────────────────

async function getAllAssignments() {
    const assignments = await prisma.userProject.findMany({
        where: { revoked_at: null },
        orderBy: { assigned_at: "desc" },
        include: {
            users: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    designation: true,
                    department: true,
                    roles: { select: { name: true, code: true } },
                },
            },
            projects: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
    });

    return assignments.map((a) => ({
        id: a.id,
        access_type: a.access_type,
        assigned_at: a.assigned_at,
        user: a.users,
        project: a.projects,
    }));
}

// ─── Get All Projects ─────────────────────────────────────────────────────────

async function getAllProjects() {
    return prisma.project.findMany({
        where: { status: "active" },
        orderBy: { name: "asc" },
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    assignAccess,
    updateAccess,
    revokeAccess,
    getUserProjects,
    getProjectUsers,
    getAllAssignments,
    getAllProjects,
};
