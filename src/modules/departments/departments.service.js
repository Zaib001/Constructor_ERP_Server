const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

/**
 * Get all active departments, with company and head info.
 */
async function getAllDepartments(user) {
    const where = applyDataScope(user);
    where.deleted_at = null;
    
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
    where.deleted_at = null;

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
async function createDepartment(data, user) {
    const { isSuperAdmin, companyId: userCompanyId } = user;
    const companyId = isSuperAdmin ? (data.companyId || data.company_id) : userCompanyId;

    if (!companyId) throw new Error("RBAC Error: Company context missing for department creation.");

    // Validate uniqueness of code if not deleting
    const existing = await prisma.department.findFirst({ where: { code: data.code, company_id: companyId } });
    if (existing) {
        if (existing.deleted_at) throw new Error(`Archived Entry: Department code '${data.code}' exists in trash. Please restore it or use a different code.`);
        throw new Error(`Duplicate Entry: Department code '${data.code}' is already assigned.`);
    }

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
    const dept = await prisma.department.findFirst({ where });
    if (!dept) throw new Error("Department not found or access denied");

    return await prisma.department.update({
        where: { id },
        data: {
            name: data.name !== undefined ? data.name : dept.name,
            description: data.description !== undefined ? data.description : dept.description,
            head_id: (data.headId || data.head_id) !== undefined ? (data.headId || data.head_id) : dept.head_id,
            is_active: data.is_active !== undefined ? data.is_active : dept.is_active,
        }
    });
}

/**
 * Delete (soft-delete) a department.
 */
async function deleteDepartment(id, user) {
    const where = applyDataScope(user);
    where.id = id;

    // 1. Verify existence and load ACTIVE member counts
    const dept = await prisma.department.findFirst({ 
        where,
        include: { 
            _count: { 
                select: { 
                    users: { 
                        where: { 
                            deleted_at: null, 
                            is_active: true 
                        } 
                    } 
                } 
            } 
        }
    });
    
    if (!dept) throw new Error("Department not found or access denied");

    // 2. Safety Check: Only block if there are ACTIVE, non-archived users
    if (dept._count.users > 0) {
        throw new Error(`Integrity Error: Cannot archive department '${dept.name}' because it contains ${dept._count.users} active member(s). Reassign them to another unit first. (Note: Archived or inactive members are ignored)`);
    }

    // 3. Mark as deleted and cleanup references
    return await prisma.department.update({
        where: { id },
        data: { 
            deleted_at: new Date(),
            is_active: false,
            head_id: null // Clear the head of department link
        }
    });
}

module.exports = {
    getAllDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment
};
