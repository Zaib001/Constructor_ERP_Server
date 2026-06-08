const prisma = require("../../db");
const bcrypt = require("bcrypt");
const { applyDataScope } = require("../../utils/scoping");

const BCRYPT_ROUNDS = 12;

/**
 * Create a new user (admin action).
 */
async function createUser(data, actorUser) {
    const { name, email, password, employeeCode, roleId, departmentId, designation, projectIds } = data;

    if (!name || !email || !password) {
        const err = new Error("Name, email, and password are required");
        err.statusCode = 400;
        throw err;
    }

    // Email uniqueness check
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        const err = new Error("Email address is already registered");
        err.statusCode = 400;
        throw err;
    }

    // Validate role if provided
    if (roleId) {
        const role = await prisma.role.findFirst({ where: { id: roleId, is_active: true } });
        if (!role) {
            const err = new Error("Specified role does not exist or is inactive");
            err.statusCode = 400;
            throw err;
        }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    // Safety: Super Admin can specify company, others must use their own session company.
    const companyId = actorUser.isSuperAdmin 
        ? (data.company_id || data.companyId) 
        : (actorUser.companyId || actorUser.company_id);
    
    const actorId = actorUser.userId || actorUser.id;

    const newUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                employee_code: employeeCode || null,
                name,
                email,
                password_hash: passwordHash,
                designation: designation || null,
                roles: roleId ? { connect: { id: roleId } } : undefined,
                departments: departmentId ? { connect: { id: departmentId } } : undefined,
                company: companyId ? { connect: { id: companyId } } : undefined,
                is_active: true,
                is_locked: false,
                login_attempts: 0,
                created_by: actorId,
            },
            select: { id: true, name: true, email: true },
        });

        if (Array.isArray(projectIds) && projectIds.length > 0) {
            await tx.userProject.createMany({
                data: projectIds.map((projectId) => ({
                    user_id: user.id,
                    project_id: projectId,
                    access_type: "contributor",
                    assigned_by: actorId,
                })),
                skipDuplicates: true,
            });
        }

        return user;
    });

    return newUser;
}

/**
 * Get all users with their roles.
 * Scoped to companyId if provided.
 */
async function getAllUsers(user) {
    const where = applyDataScope(user);
    
    // Only show active users — inactive = deleted/deactivated
    where.is_active = true;

    // Non-superadmins should NEVER see or be able to manage the super_admin persona
    if (!user.isSuperAdmin) {
        where.roles = {
            code: { not: "super_admin" }
        };
    }
    
    return await prisma.user.findMany({
        where,
        include: {
            roles: {
                select: {
                    id: true,
                    name: true,
                    code: true
                }
            }
        },
        orderBy: { created_at: "desc" }
    });
}

/**
 * Get a single user by ID.
 * Enforces company isolation if companyId is provided.
 */
async function getUserById(id, user) {
    const where = applyDataScope(user);
    where.id = id;

    return await prisma.user.findFirst({
        where,
        include: {
            roles: {
                select: {
                    id: true,
                    name: true,
                    code: true
                }
            }
        }
    });
}

/**
 * Update a user.
 */
async function updateUser(id, data, user) {
    const where = applyDataScope(user);
    where.id = id;

    // Verify existence/ownership
    const exists = await prisma.user.findFirst({ where });
    if (!exists) throw new Error("User not found or access denied");

    // Build update payload
    const updateData = {
        name: data.name,
        email: data.email,
        designation: data.designation,
        departments: (data.departmentId || data.department_id || data.department) ? { connect: { id: data.departmentId || data.department_id || data.department } } : undefined,
        employee_code: data.employeeCode || data.employee_code,
        is_active: data.is_active !== undefined ? data.is_active : data.isActive,
        roles: (data.roleId || data.role_id) ? { connect: { id: data.roleId || data.role_id } } : undefined,
    };

    // Optional password reset
    if (data.password && data.password.trim().length >= 6) {
        updateData.password_hash = await bcrypt.hash(data.password.trim(), BCRYPT_ROUNDS);
    }

    return await prisma.user.update({
        where: { id },
        data: updateData,
        include: {
            roles: {
                select: {
                    id: true,
                    name: true,
                    code: true
                }
            }
        }
    });
}

/**
 * Delete a user — deactivates the account (User model has no deleted_at column).
 */
async function deleteUser(id, user) {
    const where = applyDataScope(user);
    where.id = id;

    // Verify existence/ownership
    const exists = await prisma.user.findFirst({ where });
    if (!exists) throw new Error("User not found or access denied");

    // Deactivate: revoke sessions, mark inactive
    await prisma.userSession.deleteMany({ where: { user_id: id } });

    return await prisma.user.update({
        where: { id },
        data: { is_active: false }
    });
}

// ─── Feature 2: paginated user list ──────────────────────────────────────────

async function listUsers(actorUser, { search, role, page, limit }) {
    const ADMIN_ROLES = new Set(["super_admin", "erp_admin"]);
    if (!ADMIN_ROLES.has(actorUser.roleCode)) {
        const e = new Error("Forbidden: Admin only."); e.statusCode = 403; throw e;
    }

    const scopeWhere = applyDataScope(actorUser);
    const where = { ...scopeWhere, deleted_at: null };

    if (search) {
        where.OR = [
            { name:  { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
        ];
    }
    if (role) {
        where.roles = { code: { equals: role, mode: "insensitive" } };
    }

    const skip = (page - 1) * limit;
    const [rawUsers, total] = await Promise.all([
        prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: { created_at: "desc" },
            include: {
                roles: { select: { id: true, name: true, code: true } },
                _count: { select: { user_projects: { where: { revoked_at: null } } } },
            },
        }),
        prisma.user.count({ where }),
    ]);

    const users = rawUsers.map((u) => ({
        id:           u.id,
        name:         u.name,
        email:        u.email,
        role:         u.roles?.code?.toUpperCase() || "UNKNOWN",
        roleName:     u.roles?.name || "",
        roleId:       u.roles?.id || null,
        status:       u.is_active ? "ACTIVE" : "INACTIVE",
        projectCount: u._count.user_projects,
        createdAt:    u.created_at,
    }));

    return { total, page, limit, users };
}

// ─── Feature 2: get projects for a user ──────────────────────────────────────

async function getUserProjects(userId, actorUser) {
    const ADMIN_ROLES = new Set(["super_admin", "erp_admin"]);
    if (!ADMIN_ROLES.has(actorUser.roleCode)) {
        const e = new Error("Forbidden: Admin only."); e.statusCode = 403; throw e;
    }

    const assignments = await prisma.userProject.findMany({
        where: { user_id: userId, revoked_at: null },
        include: { projects: { select: { id: true, name: true, code: true } } },
    });

    return assignments.map((a) => ({
        id:   a.projects?.id,
        name: a.projects?.name,
        role: a.access_type,
    }));
}

// ─── Feature 2: assign user to project ───────────────────────────────────────

const VALID_ROLES = new Set(["full", "read_only", "approval_only", "contributor",
    "project_manager", "site_engineer", "storekeeper"]);

async function assignProjectAccess(actorUser, { userId, projectId, role }) {
    const ADMIN_ROLES = new Set(["super_admin", "erp_admin"]);
    if (!ADMIN_ROLES.has(actorUser.roleCode)) {
        const e = new Error("Forbidden: Admin only."); e.statusCode = 403; throw e;
    }
    if (!VALID_ROLES.has(role)) {
        const e = new Error(`Invalid role '${role}'.`); e.statusCode = 400; throw e;
    }

    const [userExists, projectExists] = await Promise.all([
        prisma.user.findFirst({ where: { id: userId, is_active: true }, select: { id: true } }),
        prisma.project.findFirst({ where: { id: projectId }, select: { id: true } }),
    ]);
    if (!userExists)    { const e = new Error("User not found.");    e.statusCode = 404; throw e; }
    if (!projectExists) { const e = new Error("Project not found."); e.statusCode = 404; throw e; }

    const existing = await prisma.userProject.findFirst({
        where: { user_id: userId, project_id: projectId, revoked_at: null },
    });
    if (existing) {
        const e = new Error("User is already assigned to this project."); e.statusCode = 409; throw e;
    }

    return prisma.userProject.create({
        data: {
            user_id: userId, project_id: projectId,
            access_type: role, assigned_by: actorUser.id, assigned_at: new Date(),
        },
        select: { id: true, user_id: true, project_id: true, access_type: true },
    });
}

// ─── Feature 2: remove user from project ─────────────────────────────────────

async function removeProjectAccess(actorUser, { userId, projectId }) {
    const ADMIN_ROLES = new Set(["super_admin", "erp_admin"]);
    if (!ADMIN_ROLES.has(actorUser.roleCode)) {
        const e = new Error("Forbidden: Admin only."); e.statusCode = 403; throw e;
    }

    const assignment = await prisma.userProject.findFirst({
        where: { user_id: userId, project_id: projectId, revoked_at: null },
    });
    if (!assignment) {
        const e = new Error("Assignment not found."); e.statusCode = 404; throw e;
    }

    await prisma.userProject.update({
        where: { id: assignment.id },
        data: { revoked_at: new Date() },
    });
}

module.exports = {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    listUsers,
    getUserProjects,
    assignProjectAccess,
    removeProjectAccess,
};
