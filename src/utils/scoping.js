"use strict";

/**
 * ERP Centralized Scoping Utility
 * 
 * This helper provides unified Prisma 'where' clauses and validation rules
 * for the 12-persona enterprise RBAC model.
 */

const MODULES = {
    HR: "HR",
    PROCUREMENT: "PROCUREMENT",
    FINANCE: "FINANCE",
    SALES: "SALES",
    INVENTORY: "INVENTORY",
    PROJECTS: "PROJECTS",
    FLEET: "FLEET",
    DOCUMENTS: "documents",
    EXECUTION: "EXECUTION",
    SYSTEM: "SYSTEM"
};

const ROLE_GROUPS = {
    PROJECT_RESTRICTED: ["project_manager", "site_engineer", "site_coordinator"],
    COMPANY_WIDE: ["erp_admin", "procurement_officer", "accounts_officer", "hr_admin", "auditor_readonly"],
    GOVERNANCE: ["super_admin"],
};

ROLE_GROUPS.GLOBAL_MANAGERS = [
    "hr_manager",
    "procurement_manager",
    "accounts_manager",
    "sales_manager"
];

const MANAGER_HORIZONS = {
    "hr_manager": [MODULES.HR, MODULES.DOCUMENTS],
    "procurement_manager": [MODULES.PROCUREMENT, MODULES.INVENTORY],
    "accounts_manager": [MODULES.FINANCE, MODULES.EXECUTION, MODULES.HR, MODULES.FLEET],
    "sales_manager": [MODULES.SALES, MODULES.PROJECTS]
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
 * @param {Object} options { module: string, isWrite: boolean, projectFilter: boolean, prefix: string, companyModel: boolean }
 */
function applyDataScope(user, options = {}) {
    const { isSuperAdmin, companyId, roleCode, id: userId } = user;
    const { 
        prefix = "", 
        module, 
        isWrite = false,
        includeDeleted = false, 
        rootSoftDelete = false, 
        noSoftDelete = false,
        companyModel = false
    } = options;

    if (process.env.DEBUG_SCOPING) console.log(`[SCOPING] Model Hook - noSoftDelete: ${noSoftDelete}`);
    const where = {};

    // Helper to apply root or prefixed filter
    const applyFilter = (key, value) => {
        if (prefix) {
            setDeep(where, `${prefix}.${key}`, value);
        } else {
            where[key] = value;
        }
    };

    // NOTE: Soft-delete filtering is intentionally disabled.
    // No model in this schema has a deleted_at column, so injecting this
    // filter universally would cause Prisma 'Unknown argument' validation errors.
    // If a model is later added that supports soft-deletes, add targeted filtering
    // at the service level for that specific model.

    // 1. Module Scoping & Manager Horizons
    // Enforcement: SuperAdmin is always global.
    if (isSuperAdmin) return where;

    // Resolve Scope: GLOBAL (no company filter) vs COMPANY (apply company filter)
    let applyCompanyFilter = true;

    // Rule: Global Managers can read across all companies WITHIN their authorized module horizon
    // Additionally, all Managers gain global read on 'SYSTEM' resources (e.g., company lists)
    const isManagerInHorizon = (role, mod) => {
        if (!ROLE_GROUPS.GLOBAL_MANAGERS.includes(role)) return false;
        
        // System metadata is global for all managers
        if (mod === MODULES.SYSTEM) return true; 

        const horizon = MANAGER_HORIZONS[role];
        return horizon ? horizon.includes(mod) : false;
    };
    
    // Only permit global access if:
    // a) User is in a manager role and module matches horizon
    // b) They are performing a READ operation (isWrite: false)
    if (isManagerInHorizon(roleCode, module) && !isWrite) {
        applyCompanyFilter = false;
    }

    // 2. Apply Company Scoping (Tenant Isolation)
    if (applyCompanyFilter) {
        if (!companyId) throw new Error("RBAC Error: Tenant context (companyId) missing for non-global operation.");
        
        // If we are querying the Company model itself, the filter applies to the primary ID
        const filterKey = companyModel ? "id" : "company_id";
        applyFilter(filterKey, companyId);
    }

    // 3. Project Scoping
    // Note: Project scoping only applies to non-superadmin and non-erp-admin roles
    if (options.projectFilter && roleCode !== "erp_admin") {
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
                setDeep(where, "projects.user_projects", {
                    some: { user_id: userId, revoked_at: null }
                });
            } else if (options.projectModel) {
                Object.assign(where, projectClause);
            } else {
                const projectPath = (prefix === "project" || prefix.endsWith(".project")) 
                    ? prefix 
                    : (prefix ? `${prefix}.project` : "project");
                
                setDeep(where, projectPath, projectClause);
            }
        }
    }

    // 4. Department Scoping
    if (options.departmentFilter && roleCode === "department_head") {
        if (user.departmentId) {
            applyFilter("department_id", user.departmentId);
        }
    }

    return where;
}

/**
 * Validates if the user has permission to interact with a specific resource ID.
 * Consistent with applyDataScope rules for both Read and Write.
 * 
 * @param {Object} prisma Prisma client instance
 * @param {String} model Name of the prisma model
 * @param {String} id Primary key value
 * @param {Object} user req.user object
 * @param {Object} options { module: string, isWrite: boolean }
 */
async function validateResourceAccess(prisma, model, id, user, options = {}) {
    if (user.isSuperAdmin) return true;
    
    const { isWrite = true, module } = options;
    
    // Generate identical query filters used in list endpoints
    const scope = applyDataScope(user, { module, isWrite, ...options });
    const where = { id, ...scope };
    
    // Ensure we don't accidentally fetch records that should be filtered
    const record = await prisma[model].findFirst({ where });
    
    if (!record) {
        const action = isWrite ? "modify" : "access";
        throw new Error(`Access Denied: You do not have permission to ${action} this ${model} or it does not belong to your company.`);
    }
    return true;
}

module.exports = {
    applyDataScope,
    validateResourceAccess,
    ROLE_GROUPS,
    MODULES,
    MANAGER_HORIZONS
};

