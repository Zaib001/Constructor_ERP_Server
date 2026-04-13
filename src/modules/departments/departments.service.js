const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

/**
 * Get all active departments, with company and head info.
 */
async function getAllDepartments(user) {
    const where = applyDataScope(user);
    where.is_active = true;
    
    return await prisma.department.findMany({
        where,
        include: {
            company: { select: { id: true, name: true, code: true } },
            _count: { select: { users: true } }
        },
        orderBy: { name: "asc" }
    });
}

/**
 * Get department by ID with head user info.
 * Enforces company isolation if companyId is provided.
 */
async function getDepartmentById(id, user) {
    const where = applyDataScope(user);
    where.id = id;

    const dept = await prisma.department.findFirst({
        where,
        include: {
            company: { select: { id: true, name: true } },
            users: {
                where: { deleted_at: null, is_active: true },
                select: { id: true, name: true, designation: true, email: true }
            }
        }
    });
    if (!dept) return null;

    // Resolve head user
    let headUser = null;
    if (dept.head_id) {
        headUser = await prisma.user.findUnique({
            where: { id: dept.head_id },
            select: { id: true, name: true, email: true, designation: true }
        });
    }
    return { ...dept, headUser };
}

/**
 * Create a new department.
 */
async function createDepartment(data, companyId) {
    return await prisma.department.create({
        data: {
            code: data.code,
            name: data.name,
            description: data.description || null,
            company_id: companyId,
            head_id: data.headId || data.head_id || null,
            is_active: true
        }
    });
}

/**
 * Update a department (including head assignment).
 */
async function updateDepartment(id, data, user) {
    const where = applyDataScope(user);
    where.id = id;

    // Verify existence/ownership
    const exists = await prisma.department.findFirst({ where });
    if (!exists) throw new Error("Department not found or access denied");

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.headId || data.head_id) updateData.head_id = data.headId || data.head_id;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    return await prisma.department.update({
        where: { id },
        data: updateData
    });
}

/**
 * Delete (soft-delete) a department.
 */
async function deleteDepartment(id, user) {
    const where = applyDataScope(user);
    where.id = id;

    // Verify existence/ownership
    const exists = await prisma.department.findFirst({ where });
    if (!exists) throw new Error("Department not found or access denied");

    return await prisma.department.update({
        where: { id },
        data: { is_active: false }
    });
}

module.exports = {
    getAllDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment
};
