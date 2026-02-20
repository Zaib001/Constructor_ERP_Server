"use strict";

const prisma = require("../../db");

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
async function findMatrices(docType, projectId, amount, department) {
    const baseWhere = {
        doc_type: docType,
        AND: [
            { OR: [{ min_amount: null }, { min_amount: { lte: amount } }] },
            { OR: [{ max_amount: null }, { max_amount: { gte: amount } }] },
        ],
    };

    // Optional department filter — only apply when the matrix row has a department set
    // (rows without department match all departments)
    if (department) {
        baseWhere.OR = [{ department: null }, { department: department }];
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
async function findActiveRequest(docType, docId) {
    return prisma.approvalRequest.findFirst({
        where: {
            doc_type: docType,
            doc_id: docId,
            current_status: { in: ["pending", "in_progress"] },
        },
    });
}

// ─── Request + Steps ──────────────────────────────────────────────────────────

async function findRequestById(approvalRequestId) {
    return prisma.approvalRequest.findFirst({
        where: { id: approvalRequestId },
        include: {
            approval_steps: {
                orderBy: { step_order: "asc" },
                include: { roles: { select: { id: true, name: true, code: true } } },
            },
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
async function findInboxSteps(userId, userRoleId, statusFilter) {
    const stepStatus = statusFilter || "pending";

    // Find all pending steps where user is direct assignee OR role matches
    const steps = await prisma.approvalStep.findMany({
        where: {
            status: stepStatus,
            OR: [
                { approver_user: userId },
                { role_id: userRoleId },
            ],
            approval_requests: {
                current_status: "in_progress",
            },
        },
        include: {
            approval_requests: {
                select: {
                    id: true,
                    doc_type: true,
                    doc_id: true,
                    project_id: true,
                    requested_by: true,
                    current_step: true,
                    total_steps: true,
                    created_at: true,
                    projects: { select: { name: true } }
                },
            },
            roles: { select: { id: true, name: true, code: true } },
        },
        orderBy: { approval_requests: { created_at: "asc" } },
    });

    // Sequential guard: filter out steps not at current_step unless is_parallel
    // (is_parallel is on the matrix; re-derive from whether multiple steps share step_order)
    // We store is_parallel context in the step via the matrix at creation time — but
    // the step model has no is_parallel. We approximate: allow step if step_order == current_step.
    return steps.filter((s) => {
        const req = s.approval_requests;
        if (!req) return false;
        // If step_order matches current_step the step is eligible regardless
        return s.step_order === req.current_step;
    });
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

async function findSentRequests(userId) {
    return prisma.approvalRequest.findMany({
        where: { requested_by: userId },
        include: {
            projects: { select: { id: true, name: true, code: true } },
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
    return prisma.user.findFirst({
        where: { id: userId, deleted_at: null, is_active: true },
        select: { id: true, name: true, email: true, role_id: true, roles: { select: { id: true, code: true } } },
    });
}

// ─── Users by Role ────────────────────────────────────────────────────────────

async function findUsersByRole(role_id) {
    return prisma.user.findMany({
        where: { role_id, is_active: true, deleted_at: null },
        include: { roles: { select: { id: true, code: true } } },
    });
}

// ─── History ──────────────────────────────────────────────────────────────────

async function findHistoryByDoc(docType, docId) {
    return prisma.approvalRequest.findMany({
        where: { doc_type: docType, doc_id: docId },
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
