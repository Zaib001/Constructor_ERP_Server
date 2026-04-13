"use strict";

const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

// ─── Matrix Loading ───────────────────────────────────────────────────────────

/**
 * Load approval matrices matching the document context.
 *
 * Strategy (project-specific first, global fallback):
 *   1. Fetch project-specific rows (project_id = projectId)
 *   2. If none found, fetch global rows (project_id IS NULL)
 *   3. Apply amount range filter (min_amount <= amount AND (max_amount IS NULL OR amount <= max_amount))
 *   4. Apply department filter (if matrix row has department set, it must match)
 *   5. Order by step_order ASC
 *
 * @param {string}  docType
 * @param {string}  projectId
 * @param {number}  amount
 * @param {string|null} department
 */
async function findMatrices(user, docType, projectId, amount, departmentId) {
    const scopeWhere = applyDataScope(user);

    const baseWhere = {
        ...scopeWhere,
        doc_type: docType,
        AND: [
            { OR: [{ min_amount: null }, { min_amount: { lte: amount } }] },
            { OR: [{ max_amount: null }, { max_amount: { gte: amount } }] },
        ],
    };

    // Optional department filter — only apply when the matrix row has a department set
    // (rows without department match all departments)
    if (departmentId) {
        baseWhere.OR = [{ department_id: null }, { department_id: departmentId }];
    }

    // Project-specific
    let matrices = await prisma.approvalMatrix.findMany({
        where: { ...baseWhere, project_id: projectId },
        orderBy: { step_order: "asc" },
        include: { roles: { select: { id: true, code: true, name: true } } },
    });

    // Global fallback
    if (matrices.length === 0) {
        matrices = await prisma.approvalMatrix.findMany({
            where: { ...baseWhere, project_id: null },
            orderBy: { step_order: "asc" },
            include: { roles: { select: { id: true, code: true, name: true } } },
        });
    }

    return matrices;
}

// ─── Active Request Detection ─────────────────────────────────────────────────

/**
 * Return an existing non-terminal approval request for the same docType+docId.
 * Terminal statuses: rejected, approved, cancelled.
 */
async function findActiveRequest(user, docType, docId) {
    const requestFilter = {
        doc_type: docType,
        doc_id: docId,
        current_status: { in: ["pending", "in_progress", "sent_back"] },
    };

    if (user && !user.isSuperAdmin) requestFilter.company_id = user.companyId;

    return prisma.approvalRequest.findFirst({
        where: requestFilter,
        orderBy: { created_at: "desc" }
    });
}

// ─── Request + Steps ──────────────────────────────────────────────────────────

async function findRequestById(approvalRequestId) {
    return prisma.approvalRequest.findFirst({
        where: { id: approvalRequestId },
        include: {
            approval_steps: {
                orderBy: { step_order: "asc" },
                include: {
                roles: { select: { id: true, name: true, code: true } },
            },
        },
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
    },
});
}

async function findRequestWithSteps(approvalRequestId) {
    return findRequestById(approvalRequestId);
}

// ─── Steps for a User (Inbox) ─────────────────────────────────────────────────

/**
 * Find all pending approval steps the user can act on.
 *
 * A user can act on a step when:
 *   - step.approver_user === userId   (direct assignment), OR
 *   - step.role_id === user.role_id   (role-based)
 * AND
 *   - step.status = "pending"
 * AND
 *   - parent request is in_progress
 * AND (sequential guard)
 *   - step.is_parallel = true OR step.step_order = request.current_step
 *
 * We join in JS because Prisma doesn't support cross-model computed filter.
 */
async function findInboxSteps(userCtx, userRoleId, statusFilter, departmentId) {
    const stepStatus = statusFilter || "pending";
    const userId = userCtx.id;

    // Apply data scope to ensure they only see steps for matching companies/projects
    const requestFilter = applyDataScope(userCtx, { projectFilter: true, prefix: "" });

    // Only enforce "in_progress" for pending steps — approved/rejected steps
    // live on requests that may have advanced or completed
    if (stepStatus === "pending") {
        requestFilter.current_status = "in_progress";
    }

    if (departmentId) {
        requestFilter.department_id = departmentId;
    }

    // Find all steps where user is direct assignee exact match
    const steps = await prisma.approvalStep.findMany({
        where: {
            status: stepStatus,
            OR: [
                { approver_user: userId },
                { AND: [{ approver_user: null }, { role_id: userRoleId }] }
            ],
            // Dynamic request-level scoping (status, company, project)
            approval_requests: {
                is: { ...requestFilter }
            }
        },
        include: {
            approval_requests: {
                select: {
                    id: true,
                    doc_type: true,
                    doc_id: true,
                    requested_by: true,
                    current_step: true,
                    total_steps: true,
                    created_at: true,
                    project_id: true,
                    project: { select: { id: true, name: true } },
                    department_id: true,
                    department: { select: { id: true, name: true, code: true } },
                    amount: true,
                    current_status: true,
                },
            },
            roles: { select: { id: true, name: true, code: true } },
        },
        orderBy: { approval_requests: { created_at: "asc" } },
    });

    // Sequential guard: only apply for pending steps
    // For approved/rejected tabs, show all matching steps (they are historical)
    if (stepStatus === "pending") {
        return steps.filter((s) => {
            const req = s.approval_requests;
            const roles = s.roles;
            if (!req) return false;

            // Self-approval block: Requester cannot see/act on their own request.
            // Exception: Super Admin can see for system oversight, but standard logic blocks action.
            if (req.requested_by === userId && roles?.code !== "super_admin") {
                return false; 
            }

            return s.step_order === req.current_step;
        });
    }

    return steps;
}

// ─── Steps at Specific Order (for parallel completion check) ──────────────────

async function findStepsAtOrder(approvalRequestId, stepOrder) {
    return prisma.approvalStep.findMany({
        where: { approval_request_id: approvalRequestId, step_order: stepOrder },
        orderBy: { step_order: "asc" },
    });
}

// ─── Next Step Order ──────────────────────────────────────────────────────────

async function findNextStepOrder(approvalRequestId, currentStepOrder) {
    const next = await prisma.approvalStep.findFirst({
        where: {
            approval_request_id: approvalRequestId,
            step_order: { gt: currentStepOrder },
            status: "pending",
        },
        orderBy: { step_order: "asc" },
    });
    return next ? next.step_order : null;
}

// ─── Delegation ───────────────────────────────────────────────────────────────

/**
 * Check whether userId has an active delegation window right now.
 * Returns the delegation record (with to_user) or null.
 */
async function findPendingDelegation(userId, now) {
    return prisma.approvalDelegation.findFirst({
        where: {
            from_user: userId,
            is_active: true,
            start_date: { lte: now },
            end_date: { gte: now },
        },
    });
}

/**
 * Find all active delegations where the given user is the delegate (to_user).
 * Used to enrich inbox: steps assigned to from_user should be visible to to_user.
 */
async function findDelegationsForInbox(toUserId, now) {
    return prisma.approvalDelegation.findMany({
        where: {
            to_user: toUserId,
            is_active: true,
            start_date: { lte: now },
            end_date: { gte: now },
        },
        select: { from_user: true },
    });
}

// ─── Requests initiated by a User ─────────────────────────────────────────────

async function findSentRequests(user) {
    const scopeWhere = applyDataScope(user);

    return prisma.approvalRequest.findMany({
        where: { ...scopeWhere, requested_by: user.id },
        include: {
            project: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            approval_steps: {
                orderBy: { step_order: "asc" },
                include: { roles: { select: { id: true, name: true, code: true } } },
            },
        },
        orderBy: { created_at: "desc" },
    });
}

// ─── User Role ────────────────────────────────────────────────────────────────

async function findUserById(userId) {
    const user = await prisma.user.findFirst({
        where: { id: userId, deleted_at: null, is_active: true },
        select: {
            id: true,
            name: true,
            email: true,
            department_id: true,
            company_id: true,
            departments: { select: { id: true, name: true } },
            roles: { select: { id: true, code: true } }
        },
    });
    if (!user) return null;
    return {
        ...user,
        role_id: user.roles?.id,
        department_id: user.department_id,
        company_id: user.company_id
    };
}

// ─── Users by Role ────────────────────────────────────────────────────────────

async function findUsersByRole(role_id, department_id, company_id) {
    const role = await prisma.role.findUnique({ where: { id: role_id } });
    const isSuperAdmin = role?.code === "super_admin";

    const whereClause = { role_id, is_active: true, deleted_at: null };
    
    // Multi-tenant isolation: every approver must belong to the same company
    // unless it's a Super Admin or global role.
    if (company_id && !isSuperAdmin) {
        whereClause.company_id = company_id;
    }
    
    if (department_id && !isSuperAdmin) {
        whereClause.department_id = department_id;
    }
    
    return prisma.user.findMany({
        where: whereClause,
        include: { roles: { select: { id: true, code: true } } },
    });
}

// ─── History ──────────────────────────────────────────────────────────────────

async function findHistoryByDoc(user, docType, docId) {
    const scopeWhere = applyDataScope(user);

    return prisma.approvalRequest.findMany({
        where: { ...scopeWhere, doc_type: docType, doc_id: docId },
        orderBy: { created_at: "desc" },
        include: {
            approval_steps: {
                orderBy: { step_order: "asc" },
                include: { roles: { select: { name: true, code: true } } },
            },
        },
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    findMatrices,
    findActiveRequest,
    findRequestById,
    findRequestWithSteps,
    findInboxSteps,
    findStepsAtOrder,
    findNextStepOrder,
    findPendingDelegation,
    findDelegationsForInbox,
    findUserById,
    findUsersByRole,
    findHistoryByDoc,
    findSentRequests,
};
