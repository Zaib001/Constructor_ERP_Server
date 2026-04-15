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

    return await prisma.user.update({
        where: { id },
        data: {
            name: data.name,
            email: data.email,
            designation: data.designation,
            departments: (data.departmentId || data.department_id || data.department) ? { connect: { id: data.departmentId || data.department_id || data.department } } : undefined,
            employee_code: data.employeeCode || data.employee_code,
            is_active: data.is_active !== undefined ? data.is_active : data.isActive,
            roles: (data.roleId || data.role_id) ? { connect: { id: data.roleId || data.role_id } } : undefined,
        },
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
 * Delete a user (soft delete).
 */
async function deleteUser(id, user) {
    const where = applyDataScope(user);
    where.id = id;

    // Verify existence/ownership
    const exists = await prisma.user.findFirst({ where });
    if (!exists) throw new Error("User not found or access denied");

    return await prisma.user.update({
        where: { id },
        data: {
            deleted_at: new Date(),
            is_active: false
        }
    });
}

module.exports = {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
};
