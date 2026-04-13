"use strict";

/**
 * ERP Centralized Scoping Utility
 * 
 * This helper provides unified Prisma 'where' clauses and validation rules
 * for the 12-persona enterprise RBAC model.
 */

const ROLE_GROUPS = {
    PROJECT_RESTRICTED: ["project_manager", "site_engineer", "site_coordinator"],
    COMPANY_WIDE: ["erp_admin", "procurement_officer", "accounts_officer", "hr_admin", "auditor_readonly"],
    GOVERNANCE: ["super_admin"]
};

/**
 * Internal helper to set a value at a potentially deep path in an object, merging if objects exist.
 */
function setDeep(target, path, data) {
    const parts = path.split(".");
    let current = target;
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p) continue;
        if (i === parts.length - 1) {
            // Final level: merge data
            if (typeof data === "object" && data !== null && !Array.isArray(data)) {
                current[p] = { ...(current[p] || {}), ...data };
            } else {
                current[p] = data;
            }
        } else {
            // Traverse or create
            current[p] = current[p] || {};
            current = current[p];
        }
    }
}

/**
 * Returns a Prisma 'where' clause fragment for filtering records by company, project, or department.
 * 
 * @param {Object} user req.user object
 * @param {Object} options { projectFilter: boolean, departmentFilter: boolean, prefix: string }
 */
function applyDataScope(user, options = {}) {
    const { isSuperAdmin, companyId, roleCode, id: userId } = user;
    const { prefix = "", includeDeleted = false, rootSoftDelete = false, noSoftDelete = false } = options;
    const where = {};

    // Helper to apply root or prefixed filter
    const applyFilter = (key, value) => {
        if (prefix) {
            setDeep(where, `${prefix}.${key}`, value);
        } else {
            where[key] = value;
        }
    };

    // 0. Soft-Delete Filter
    // Apply to prefix if provided
    if (!includeDeleted && !noSoftDelete) {
        if (prefix) {
            applyFilter("deleted_at", null);
        }
        
        // Apply to root if no prefix OR if explicitly requested (e.g. for WBS)
        if (!prefix || rootSoftDelete) {
            where.deleted_at = null;
        }
    }

    // 1. Company Scoping (Tenant Isolation)
    if (!isSuperAdmin) {
        if (!companyId) throw new Error("RBAC Error: Tenant context (companyId) missing for non-superadmin user.");
        applyFilter("company_id", companyId);
    }

    // 2. Project Scoping
    if (options.projectFilter && !isSuperAdmin && roleCode !== "erp_admin") {
        if (ROLE_GROUPS.PROJECT_RESTRICTED.includes(roleCode)) {
            const projectClause = {
                user_projects: {
                    some: {
                        user_id: userId,
                        revoked_at: null
                    }
                }
            };
            
            if (options.userProjectModel) {
                // Special case for UserProject model itself
                // PM should see all assignments for projects they manage
                setDeep(where, "projects.user_projects", {
                    some: {
                        user_id: userId,
                        revoked_at: null
                    }
                });
            } else if (options.projectModel) {
                // Special case for Project model itself
                Object.assign(where, projectClause);
            } else {
                // Dynamic pathing for related objects
                // Fix: If prefix is already 'project' or ends with '.project', don't nest it again
                const projectPath = (prefix === "project" || prefix.endsWith(".project")) 
                    ? prefix 
                    : (prefix ? `${prefix}.project` : "project");
                
                setDeep(where, projectPath, projectClause);
            }
        }
    }

    // 3. Department Scoping
    if (options.departmentFilter && !isSuperAdmin && roleCode === "department_head") {
        if (user.departmentId) {
            applyFilter("department_id", user.departmentId);
        }
    }

    return where;
}

/**
 * Validates if the user has permission to interact with a specific resource ID.
 * Useful for 'create' or 'update' operations involving foreign keys.
 * 
 * @param {Object} prisma Prisma client instance
 * @param {String} model Name of the prisma model (e.g., 'project', 'vendor')
 * @param {String} id Primary key value
 * @param {Object} user req.user object
 */
async function validateResourceAccess(prisma, model, id, user) {
    if (user.isSuperAdmin) return true;
    
    // Always enforce company matching
    const where = { id, company_id: user.companyId, deleted_at: null };
    
    // For project targets, check assignment if needed
    if (model.toLowerCase() === "project" && ROLE_GROUPS.PROJECT_RESTRICTED.includes(user.roleCode)) {
        where.user_projects = {
            some: {
                user_id: user.id,
                revoked_at: null
            }
        };
    }

    const record = await prisma[model].findFirst({ where });
    if (!record) {
        throw new Error(`Access Denied: You do not have permission to access this ${model} or it does not belong to your company.`);
    }
    return true;
}

module.exports = {
    applyDataScope,
    validateResourceAccess,
    ROLE_GROUPS
};
