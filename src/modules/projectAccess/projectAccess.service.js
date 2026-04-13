const prisma = require("../../db");
const logger = require("../../logger");
const { applyDataScope } = require("../../utils/scoping");
const { logAudit } = require("../../utils/auditLogger");

const ACCESS_TYPES = ["full", "read_only", "approval_only"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAppError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ─── Assign User to Project ───────────────────────────────────────────────────

async function assignAccess(data, user, actorId, ipAddress, deviceInfo) {
    const { userId, projectId, accessType } = data;

    // 1. Tenant & Project Security
    const project = await prisma.project.findFirst({
        where: { ...applyDataScope(user, { projectFilter: true, projectModel: true }), id: projectId }
    });
    if (!project) throw createAppError("Project not found or access denied", 404);

    // Prevent self-assignment
    if (userId === actorId) {
        throw createAppError("You cannot assign project access to yourself", 403);
    }

    // Validate user exists and is active
    const targetUser = await prisma.user.findFirst({
        where: { id: userId, deleted_at: null, is_active: true },
        select: { id: true, name: true, email: true },
    });
    if (!targetUser) {
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
            users: { connect: { id: userId } },
            projects: { connect: { id: projectId } },
            access_type: accessType,
            assigned_by: actorId,
            assigned_at: new Date(),
        },
        select: {
            id: true,
            users: { select: { id: true } },
            projects: { select: { id: true } },
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
    return {
        id: assignment.id,
        user_id: assignment.users?.id,
        project_id: assignment.projects?.id,
        access_type: assignment.access_type,
        assigned_by: assignment.assigned_by,
        assigned_at: assignment.assigned_at,
        user: targetUser
    };
}

// ─── Update Access Level ──────────────────────────────────────────────────────

async function updateAccess(id, accessType, user, actorId, ipAddress, deviceInfo) {
    const where = applyDataScope(user, { projectFilter: true, prefix: "projects", noSoftDelete: true });

    const assignment = await prisma.userProject.findFirst({
        where: { id, revoked_at: null, projects: where },
        select: {
            id: true, users: { select: { id: true } }, projects: { select: { id: true } }, access_type: true, assigned_by: true,
        },
    });
    if (!assignment) {
        throw createAppError("Assignment not found or access denied", 404);
    }

    const oldType = assignment.access_type;

    const updated = await prisma.userProject.update({
        where: { id },
        data: { access_type: accessType },
        select: {
            id: true,
            users: { select: { id: true } },
            projects: { select: { id: true } },
            access_type: true
        },
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
    return {
        id: updated.id,
        user_id: updated.users?.id,
        project_id: updated.projects?.id,
        access_type: updated.access_type
    };
}

// ─── Revoke Access ────────────────────────────────────────────────────────────

async function revokeAccess(id, user, actorId, ipAddress, deviceInfo) {
    const where = applyDataScope(user, { projectFilter: true, prefix: "projects", noSoftDelete: true });

    const assignment = await prisma.userProject.findFirst({
        where: { id, revoked_at: null, projects: where },
        select: {
            id: true,
            users: { select: { id: true } },
            projects: { select: { id: true } },
            access_type: true
        },
    });
    if (!assignment) {
        throw createAppError("Assignment not found or access denied", 404);
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
        beforeData: { user_id: assignment.users?.id, project_id: assignment.projects?.id, access_type: assignment.access_type },
        afterData: { revoked_at: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Project access revoked: id=${id} by=${actorId}`);
}

// ─── Get Projects for a User ──────────────────────────────────────────────────

async function getUserProjects(userId, caller) {
    // Validate user exists
    const targetUser = await prisma.user.findFirst({
        where: { id: userId, deleted_at: null },
        select: { id: true, name: true, email: true, company_id: true }
    });
    if (!targetUser) throw createAppError("User not found", 404);

    // 1. Get scoped projects based on the CALLER'S permissions
    // This ensures that restricted roles (like Site Engineers) only see projects they are assigned to.
    const where = applyDataScope(caller, { projectFilter: true, projectModel: true });
    where.status = "active";
    
    const companyProjects = await prisma.project.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true }
    });

    // 2. Get explicit UserProject assignments (for access_type info)
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

    // 3. Merge: company projects + assigned projects (deduplicated by project ID)
    const assignedMap = new Map();
    for (const a of assignments) {
        if (a.projects) {
            assignedMap.set(a.projects.id, {
                id: a.projects.id,
                project_id: a.projects.id,
                assignment_id: a.id,
                name: a.projects.name,
                code: a.projects.code,
                access_type: a.access_type,
                assigned_at: a.assigned_at
            });
        }
    }

    // Add company projects that aren't already in assignments
    for (const p of companyProjects) {
        if (!assignedMap.has(p.id)) {
            assignedMap.set(p.id, {
                id: p.id,
                project_id: p.id,
                name: p.name,
                code: p.code,
                access_type: "department",
                assigned_at: null
            });
        }
    }

    return {
        user: { id: targetUser.id, name: targetUser.name, email: targetUser.email },
        projects: Array.from(assignedMap.values()),
    };
}

// ─── Get Users for a Project ──────────────────────────────────────────────────

async function getProjectUsers(projectId, user) {
    const where = applyDataScope(user, { projectFilter: true, prefix: "projects", noSoftDelete: true });

    const assignments = await prisma.userProject.findMany({
        where: { project_id: projectId, revoked_at: null, projects: where },
        orderBy: { assigned_at: "desc" },
        include: {
            users: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    designation: true,
                    departments: { select: { id: true } },
                    roles: { select: { name: true, code: true } },
                },
            },
        },
    });

    return assignments.map((a) => ({
        assignmentId: a.id,
        accessType: a.access_type,
        assignedAt: a.assigned_at,
        user: {
            ...a.users,
            department_id: a.users?.departments?.id
        },
    }));
}

// ─── Get All Assignments (Admin) ──────────────────────────────────────────────

async function getAllAssignments(user) {
    const where = applyDataScope(user, { projectFilter: true, userProjectModel: true, prefix: "projects", noSoftDelete: true });

    const assignments = await prisma.userProject.findMany({
        where: { ...where, revoked_at: null },
        orderBy: { assigned_at: "desc" },
        include: {
            users: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    designation: true,
                    departments: { select: { id: true } },
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
        user: {
            ...a.users,
            department_id: a.users?.departments?.id
        },
        project: a.projects,
    }));
}

// ─── Get All Projects ─────────────────────────────────────────────────────────

async function getAllProjects(user) {
    const where = applyDataScope(user, { projectFilter: true, projectModel: true });
    where.status = "active";

    return prisma.project.findMany({
        where,
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
