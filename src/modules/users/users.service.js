const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

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
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
};
