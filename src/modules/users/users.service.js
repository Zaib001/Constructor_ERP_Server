"use strict";

const prisma = require("../../db");

/**
 * Get all users with their roles.
 */
async function getAllUsers() {
    return await prisma.user.findMany({
        where: { deleted_at: null },
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
 */
async function getUserById(id) {
    return await prisma.user.findUnique({
        where: { id, deleted_at: null },
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
async function updateUser(id, data) {
    return await prisma.user.update({
        where: { id },
        data: {
            name: data.name,
            email: data.email,
            department: data.department,
            designation: data.designation,
            employee_code: data.employeeCode || data.employee_code,
            is_active: data.is_active !== undefined ? data.is_active : data.isActive,
            role_id: data.roleId || data.role_id,
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
async function deleteUser(id) {
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
