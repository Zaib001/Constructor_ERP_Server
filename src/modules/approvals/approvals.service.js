"use strict";

const prisma = require("../../db");
const logger = require("../../logger");
const { logAudit } = require("../../utils/auditLogger");
const repo = require("./approvals.repository");
const { updateDocumentStatus } = require("./approvals.adapter");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAppError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

/**
 * Resolve the actual approver for a matrix row.
 *
 * Strategy:
 *   1. Get all users with the required role
 *   2. Remove the document requester (self-approval block)
 *   3. For each candidate, check if they have an active delegation — swap to delegatee
 *   4. Return first valid candidate (or null if role-based and assignment deferred)
 *
 * Returning null is safe: inbox query falls back to role-based matching.
 */
async function resolveApprover(roleId, requestedBy) {
    if (!roleId) return null;

    const candidates = await repo.findUsersByRole(roleId);
    const now = new Date();

    for (const user of candidates) {
        // Self-approval block (Super Admin is allowed)
        if (user.id === requestedBy && user.roles.code !== "super_admin") continue;

        // Check delegation
        const delegation = await repo.findPendingDelegation(user.id, now);
        if (delegation) {
            // Delegate cannot be the requester either
            if (delegation.to_user !== requestedBy) {
                return { userId: delegation.to_user, delegated: true };
            }
            continue; // delegation also points to requester — skip
        }

        return { userId: user.id, delegated: false };
    }

    return null; // Will be resolved dynamically in inbox by role match
}

// ─── 1. Request Approval ──────────────────────────────────────────────────────

async function requestApproval(data, actorId, ipAddress, deviceInfo) {
    const { docType, docId, projectId, amount, department } = data;

    // Check for an existing active approval for this document
    const existingRequest = await repo.findActiveRequest(docType, docId);
    if (existingRequest) {
        throw createAppError(
            `An active approval request already exists for this document (status: ${existingRequest.current_status})`,
            409
        );
    }

    // Load matching approval matrices
    const numericAmount = Number(amount) || 0;
    const matrices = await repo.findMatrices(docType, projectId, numericAmount, department);
    if (matrices.length === 0) {
        logger.warn(`Approval Matrix not found: docType=${docType}, projectId=${projectId}, amount=${numericAmount}, department=${department}`);
        // Log all matrices for this docType to debug
        const allForDoc = await prisma.approvalMatrix.findMany({ where: { doc_type: docType } });
        logger.debug(`Existing matrices for ${docType}:`, allForDoc);

        throw createAppError(
            `No approval matrix configured for docType='${docType}', projectId='${projectId}', amount=${numericAmount}. Contact the ERP administrator.`,
            422
        );
    }

    // Resolve distinct step orders (for totalSteps count)
    const uniqueStepOrders = [...new Set(matrices.map((m) => m.step_order))].sort((a, b) => a - b);
    const firstStepOrder = uniqueStepOrders[0];

    // Build the steps to create
    const stepInserts = [];
    for (const matrix of matrices) {
        const resolved = await resolveApprover(matrix.role_id, actorId);
        stepInserts.push({
            step_order: matrix.step_order,
            role_id: matrix.role_id,
            approver_user: resolved?.userId || null,
            status: "pending",
            escalated: false,
        });
    }

    // Create approval_request + approval_steps in a single transaction
    const approvalRequest = await prisma.$transaction(async (tx) => {
        const req = await tx.approvalRequest.create({
            data: {
                doc_type: docType,
                doc_id: docId,
                projects: projectId ? { connect: { id: projectId } } : undefined,
                requested_by: actorId,
                current_status: "in_progress",
                total_steps: uniqueStepOrders.length,
                current_step: firstStepOrder,
                amount: numericAmount,
                department: department || null,
                is_completed: false,
                created_at: new Date(),
            },
        });

        // Create all steps
        await tx.approvalStep.createMany({
            data: stepInserts.map((s) => ({
                ...s,
                approval_request_id: req.id,
            })),
        });

        return req;
    });

    // Update document status → submitted / in_approval
    try {
        await updateDocumentStatus({ docType, docId, status: "in_approval" });

        await logAudit({
            userId: actorId,
            module: "approvals",
            entity: "approval_request",
            entityId: approvalRequest.id,
            action: "REQUEST_APPROVAL",
            beforeData: null,
            afterData: { docType, docId, projectId, amount: numericAmount, totalSteps: uniqueStepOrders.length, currentStep: firstStepOrder },
            ipAddress,
            deviceInfo,
        });
    } catch (auditErr) {
        logger.error("requestApproval audit/status failed", auditErr);
    }

    logger.info(`Approval requested: ${docType} ${docId} → request=${approvalRequest.id} steps=${uniqueStepOrders.length}`);

    return {
        approvalRequestId: approvalRequest.id,
        currentStatus: approvalRequest.current_status,
        totalSteps: approvalRequest.total_steps,
        currentStep: approvalRequest.current_step,
    };
}

// ─── 2. Approver Inbox ────────────────────────────────────────────────────────

async function getInbox(userId, statusFilter) {
    const user = await repo.findUserById(userId);
    if (!user) throw createAppError("User not found", 404);

    const now = new Date();
    const filter = statusFilter || "pending";
    const isAdmin = user.roles?.code === "super_admin" || user.roles?.code === "erp_admin";

    let ownSteps = [];
    if (filter === "sent") {
        ownSteps = await repo.findSentRequests(userId);
        return ownSteps.map(r => ({
            id: r.id,
            approvalRequestId: r.id,
            docType: r.doc_type,
            docId: r.doc_id,
            projectId: r.project_id,
            projectName: r.projects?.name || "Global",
            requestedBy: r.requested_by,
            requestedByName: user.name,
            currentStatus: r.current_status,
            totalSteps: r.total_steps,
            currentStep: r.current_step,
            submittedAt: r.created_at,
            amount: r.amount,
            department: r.department
        }));
    }

    // New: Allow Admins to see all sent requests
    if (isAdmin && filter === "all_sent") {
        ownSteps = await prisma.approvalRequest.findMany({
            include: {
                projects: { select: { id: true, name: true, code: true } },
                approval_steps: {
                    orderBy: { step_order: "asc" },
                    include: { roles: { select: { id: true, name: true, code: true } } },
                },
            },
            orderBy: { created_at: "desc" },
        });
        return await Promise.all(ownSteps.map(async (r) => {
            const requester = await prisma.user.findUnique({
                where: { id: r.requested_by },
                select: { name: true }
            });
            return {
                id: r.id,
                approvalRequestId: r.id,
                docType: r.doc_type,
                docId: r.doc_id,
                projectId: r.project_id,
                projectName: r.projects?.name || "Global",
                requestedBy: r.requested_by,
                requestedByName: requester?.name || "Unknown",
                currentStatus: r.current_status,
                totalSteps: r.total_steps,
                currentStep: r.current_step,
                submittedAt: r.created_at,
                amount: r.amount,
                department: r.department
            };
        }));
    }

    if (isAdmin && (filter === "pending" || filter === "approved" || filter === "rejected")) {
        // Admins see all steps matching the status system-wide
        // For "pending", we exclude their own requests if they AREN'T the assigned approver,
        // but wait, if we allow self-approval now, we can just show everything.
        ownSteps = await prisma.approvalStep.findMany({
            where: { status: filter },
            orderBy: { step_order: "asc" },
            include: {
                roles: { select: { id: true, name: true, code: true } },
                approval_requests: {
                    include: {
                        projects: { select: { id: true, name: true, code: true } }
                    }
                }
            }
        });
    } else {
        // 1. Own steps (direct assignment OR role match)
        ownSteps = await repo.findInboxSteps(userId, user.role_id, filter);
    }

    // 2. Delegated steps (unless we already fetched everything as admin)
    let delegatedSteps = [];
    if (!isAdmin || filter !== "pending") {
        const activeDelegations = await repo.findDelegationsForInbox(userId, now);
        const delegatorIds = activeDelegations.map((d) => d.from_user);

        for (const delegatorId of delegatorIds) {
            const delegator = await repo.findUserById(delegatorId);
            if (!delegator) continue;
            const steps = await repo.findInboxSteps(delegatorId, delegator.role_id, filter);
            delegatedSteps = delegatedSteps.concat(
                steps.map((s) => ({ ...s, _delegatedFrom: delegatorId }))
            );
        }
    }

    // 3. Merge and deduplicate by step ID (own steps take priority)
    const seen = new Set(ownSteps.map((s) => s.id));
    const merged = [...ownSteps];
    for (const s of delegatedSteps) {
        if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
    }

    // 4. Enrich with requester names
    const enriched = await Promise.all(merged.map(async (s) => {
        const requester = await prisma.user.findUnique({
            where: { id: s.approval_requests?.requested_by },
            select: { name: true }
        });
        return {
            stepId: s.id,
            approvalRequestId: s.approval_request_id,
            docType: s.approval_requests?.doc_type,
            docId: s.approval_requests?.doc_id,
            projectId: s.approval_requests?.project_id,
            projectName: s.approval_requests?.projects?.name || "Global",
            requestedBy: s.approval_requests?.requested_by,
            requestedByName: requester?.name || "Personnel",
            stepOrder: s.step_order,
            totalSteps: s.approval_requests?.total_steps,
            role: s.roles ? { name: s.roles.name, code: s.roles.code } : null,
            approverUser: s.approver_user,
            status: s.status,
            submittedAt: s.approval_requests?.created_at,
            escalated: s.escalated,
            delegatedFrom: s._delegatedFrom || null,
        };
    }));

    return enriched;
}

// ─── 3. Approve Step ──────────────────────────────────────────────────────────

async function approveStep(approvalRequestId, actorId, remarks, ipAddress, deviceInfo) {
    const actor = await repo.findUserById(actorId);
    if (!actor) throw createAppError("Actor user not found", 404);

    const request = await repo.findRequestWithSteps(approvalRequestId);
    if (!request) throw createAppError("Approval request not found", 404);
    if (request.current_status !== "in_progress") {
        throw createAppError(`Cannot approve — request is already '${request.current_status}'`, 409);
    }

    // Self-approval block (Bypassed for Super Admins/ERP Admins for override capability)
    const isAdmin = actor.roles?.code === "super_admin" || actor.roles?.code === "erp_admin";
    if (request.requested_by === actorId && !isAdmin) {
        throw createAppError("Self-approval is not allowed", 403);
    }

    // Find the step(s) this user can act on at the current step_order
    // Also allow if actor is an active delegate of the step's assigned approver
    const now = new Date();
    const activeDelegations = await repo.findDelegationsForInbox(actorId, now);
    const delegatorIds = new Set(activeDelegations.map((d) => d.from_user));

    const actableSteps = request.approval_steps.filter((s) => {
        if (s.step_order !== request.current_step) return false;
        if (s.status !== "pending") return false;

        const isAdmin = actor.roles?.code === "super_admin" || actor.roles?.code === "erp_admin";
        if (isAdmin) return true;

        // Direct assignment OR role match OR acting as delegate
        return (
            s.approver_user === actorId ||
            s.role_id === actor.role_id ||
            (s.approver_user && delegatorIds.has(s.approver_user))
        );
    });

    if (actableSteps.length === 0) {
        // Idempotency: check if already approved at this step
        const alreadyDone = request.approval_steps.find(
            (s) => s.step_order === request.current_step &&
                (s.approver_user === actorId || s.role_id === actor.role_id) &&
                s.status === "approved"
        );
        if (alreadyDone) {
            return {
                approvalRequestId,
                currentStatus: request.current_status,
                currentStep: request.current_step,
                note: "Already approved at this step",
            };
        }
        throw createAppError("No pending approval step found for you at the current step", 403);
    }


    // Mark all actable steps as approved in a transaction, then advance or complete
    const result = await prisma.$transaction(async (tx) => {
        // Approve each actable step (parallel scenario: may be only one or multiple)
        for (const step of actableSteps) {
            await tx.approvalStep.update({
                where: { id: step.id },
                data: {
                    status: "approved",
                    action: "approve",
                    remarks: remarks || null,
                    approved_at: now,
                    approver_user: actorId, // solidify who acted
                },
            });
        }

        // Check if all mandatory steps at this step_order are satisfied  
        // (parallel approval: ALL pending steps at same order must become approved)
        const allStepsAtCurrentOrder = request.approval_steps.filter(
            (s) => s.step_order === request.current_step
        );
        const stillPending = allStepsAtCurrentOrder.filter(
            (s) => !actableSteps.find((a) => a.id === s.id) && s.status === "pending"
        );

        if (stillPending.length > 0) {
            // More parallel approvers still need to act — stay at current step
            return { status: request.current_status, nextStep: request.current_step };
        }

        // All steps at current order done — see if there's a next step
        const nextStepOrder = await repo.findNextStepOrder(approvalRequestId, request.current_step);

        if (nextStepOrder !== null) {
            const updated = await tx.approvalRequest.update({
                where: { id: approvalRequestId },
                data: { current_step: nextStepOrder },
            });
            return { status: updated.current_status, nextStep: nextStepOrder };
        } else {
            // All steps complete — mark approved
            const updated = await tx.approvalRequest.update({
                where: { id: approvalRequestId },
                data: {
                    current_status: "approved",
                    is_completed: true,
                    completed_at: now,
                },
            });
            return { status: updated.current_status, nextStep: null };
        }
    });

    // Update document status if fully approved
    if (result.status === "approved") {
        await updateDocumentStatus({ docType: request.doc_type, docId: request.doc_id, status: "approved" });
    }

    await logAudit({
        userId: actorId,
        module: "approvals",
        entity: "approval_step",
        entityId: approvalRequestId,
        action: "APPROVE_STEP",
        beforeData: { step: request.current_step, status: "pending" },
        afterData: { status: "approved", nextStep: result.nextStep },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Step approved: request=${approvalRequestId} by=${actorId} → status=${result.status} nextStep=${result.nextStep}`);

    return {
        approvalRequestId,
        currentStatus: result.status,
        currentStep: result.nextStep,
    };
}

// ─── 4. Reject Step ───────────────────────────────────────────────────────────

async function rejectStep(approvalRequestId, actorId, remarks, ipAddress, deviceInfo) {
    const actor = await repo.findUserById(actorId);
    if (!actor) throw createAppError("Actor user not found", 404);

    const request = await repo.findRequestWithSteps(approvalRequestId);
    if (!request) throw createAppError("Approval request not found", 404);
    if (request.current_status !== "in_progress") {
        throw createAppError(`Cannot reject — request is already '${request.current_status}'`, 409);
    }

    // Self-rejection not meaningful but still allowed (different from self-approval)
    const isAdmin = actor.roles?.code === "super_admin" || actor.roles?.code === "erp_admin";

    // Find the step this user can act on
    const actableStep = request.approval_steps.find((s) => {
        if (s.step_order !== request.current_step) return false;
        if (s.status !== "pending") return false;
        if (isAdmin) return true;
        return s.approver_user === actorId || s.role_id === actor.role_id;
    });

    if (!actableStep) {
        throw createAppError("No pending approval step found for you at the current step", 403);
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
        // Mark the step as rejected
        await tx.approvalStep.update({
            where: { id: actableStep.id },
            data: {
                status: "rejected",
                action: "reject",
                remarks: remarks || null,
                approved_at: now,
                approver_user: actorId,
            },
        });

        // Reject cascades to the entire request
        await tx.approvalRequest.update({
            where: { id: approvalRequestId },
            data: {
                current_status: "rejected",
                is_completed: true,
                completed_at: now,
            },
        });

        // Skip all remaining pending steps
        await tx.approvalStep.updateMany({
            where: {
                approval_request_id: approvalRequestId,
                status: "pending",
            },
            data: { status: "skipped" },
        });
    });

    await updateDocumentStatus({ docType: request.doc_type, docId: request.doc_id, status: "rejected" });

    await logAudit({
        userId: actorId,
        module: "approvals",
        entity: "approval_step",
        entityId: approvalRequestId,
        action: "REJECT_STEP",
        beforeData: { step: request.current_step, status: "pending" },
        afterData: { status: "rejected", remarks },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Step rejected: request=${approvalRequestId} by=${actorId} at step=${request.current_step}`);

    return { approvalRequestId, currentStatus: "rejected" };
}

// ─── 5. Approval History ──────────────────────────────────────────────────────

async function getHistory(docType, docId) {
    const records = await repo.findHistoryByDoc(docType, docId);
    return records.map((r) => ({
        ...r,
        approval_steps: r.approval_steps.map((s) => ({
            id: s.id,
            stepOrder: s.step_order,
            role: s.roles ? { name: s.roles.name, code: s.roles.code } : null,
            approverUser: s.approver_user,
            status: s.status,
            action: s.action,
            remarks: s.remarks,
            approvedAt: s.approved_at,
            escalated: s.escalated,
        })),
    }));
}

// ─── 6. Cancel Approval ───────────────────────────────────────────────────────

async function cancelApproval(approvalRequestId, actorId, ipAddress, deviceInfo) {
    const actor = await repo.findUserById(actorId);
    if (!actor) throw createAppError("User not found", 404);

    const request = await repo.findRequestById(approvalRequestId);
    if (!request) throw createAppError("Approval request not found", 404);
    if (request.current_status !== "in_progress") {
        throw createAppError(`Cannot cancel — request is '${request.current_status}'`, 409);
    }

    // Only requester or system admin (is_system_role) can cancel
    const isRequester = request.requested_by === actorId;
    const isAdmin = actor.roles?.code === "SUPER_ADMIN";
    if (!isRequester && !isAdmin) {
        throw createAppError("Only the requester or an admin can cancel an approval", 403);
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
        await tx.approvalRequest.update({
            where: { id: approvalRequestId },
            data: { current_status: "cancelled", is_completed: true, completed_at: now },
        });
        await tx.approvalStep.updateMany({
            where: { approval_request_id: approvalRequestId, status: "pending" },
            data: { status: "skipped" },
        });
    });

    await updateDocumentStatus({ docType: request.doc_type, docId: request.doc_id, status: "cancelled" });

    await logAudit({
        userId: actorId,
        module: "approvals",
        entity: "approval_request",
        entityId: approvalRequestId,
        action: "CANCEL_APPROVAL",
        beforeData: { status: "in_progress" },
        afterData: { status: "cancelled" },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Approval cancelled: request=${approvalRequestId} by=${actorId}`);
    return { approvalRequestId, currentStatus: "cancelled" };
}

async function getRequestById(id) {
    const r = await repo.findRequestById(id);
    if (!r) throw createAppError("Approval request not found", 404);

    const requester = await prisma.user.findUnique({
        where: { id: r.requested_by },
        select: { name: true }
    });

    const steps = await Promise.all(r.approval_steps.map(async (s) => {
        let approverName = null;
        if (s.approver_user) {
            const u = await prisma.user.findUnique({
                where: { id: s.approver_user },
                select: { name: true }
            });
            approverName = u?.name;
        }
        return {
            id: s.id,
            stepOrder: s.step_order,
            role: s.roles ? { name: s.roles.name, code: s.roles.code } : null,
            approverUser: s.approver_user,
            approverName: approverName,
            status: s.status,
            action: s.action,
            remarks: s.remarks,
            approvedAt: s.approved_at,
            escalated: s.escalated,
        };
    }));

    return {
        id: r.id,
        docType: r.doc_type,
        docId: r.doc_id,
        projectId: r.project_id,
        projectName: r.projects?.name || "Global",
        requestedBy: r.requested_by,
        requestedByName: requester?.name || "Unknown",
        currentStatus: r.current_status,
        amount: r.amount,
        department: r.department,
        totalSteps: r.total_steps,
        currentStep: r.current_step,
        isCompleted: r.is_completed,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        steps: steps,
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    requestApproval,
    getInbox,
    approveStep,
    rejectStep,
    getHistory,
    cancelApproval,
    getRequestById,
};
