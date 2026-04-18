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
async function resolveApprover(roleId, requestedBy, departmentId, companyId) {
    if (!roleId) return null;

    // Helper to find escalations if self-approval is blocked
    const findEscalation = async (rCode, compId) => {
        const adminRole = await prisma.role.findFirst({ where: { code: rCode } });
        if (!adminRole) return null;
        const admins = await repo.findUsersByRole(adminRole.id, null, compId);
        const validAdmin = admins.find(a => a.id !== requestedBy);
        return validAdmin ? { userId: validAdmin.id, delegated: false } : null;
    };

    // ─── New Logic: Support Department Head ───
    if (departmentId) {
        const dept = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { head_id: true }
        });
        
        if (dept?.head_id && dept.head_id !== requestedBy) {
            const headUser = await prisma.user.findFirst({
                where: { id: dept.head_id, role_id: roleId }
            });
            if (headUser) return { userId: headUser.id, delegated: false };
        }
    }

    const candidates = await repo.findUsersByRole(roleId, departmentId, companyId);
    const now = new Date();

    for (const user of candidates) {
        if (user.id === requestedBy) continue; 

        // Check delegation
        const delegation = await repo.findPendingDelegation(user.id, now);
        if (delegation) {
            if (delegation.to_user !== requestedBy) {
                return { userId: delegation.to_user, delegated: true };
            }
            continue; 
        }

        return { userId: user.id, delegated: false };
    }

    // ─── Escalation Logic: If requester is the only approver or no candidates found ───
    logger.info(`Self-approval detected or no candidates found for roleId=${roleId}. Attempting escalation...`);
    
    // 1. Try Dept Head
    if (departmentId) {
        const dept = await prisma.department.findUnique({ where: { id: departmentId } });
        if (dept?.head_id && dept.head_id !== requestedBy) {
            return { userId: dept.head_id, delegated: false };
        }
    }

    // 2. Try ERP Admin
    const erpAdmin = await findEscalation("erp_admin", companyId);
    if (erpAdmin) return erpAdmin;

    // 3. Try Super Admin
    const superAdmin = await findEscalation("super_admin", null);
    if (superAdmin) return superAdmin;

    throw createAppError(`No eligible approver found for role ${roleId}. Escalation failed as Dept Head, ERP Admin, and Super Admin are unavailable or were the requester themselves.`, 400);
}

// ─── 1. Request Approval ──────────────────────────────────────────────────────

async function requestApproval(data, actorId, ipAddress, deviceInfo) {
    const { docType, docId, projectId, amount, items } = data;

    const actorUserRaw = await repo.findUserById(actorId);
    if (!actorUserRaw) throw createAppError("Actor user not found", 404);

    const userCtx = {
        id: actorUserRaw.id,
        companyId: actorUserRaw.company_id,
        roleCode: actorUserRaw.roles?.code || "unknown",
        isSuperAdmin: (actorUserRaw.roles?.code === "super_admin")
    };

    const departmentId = actorUserRaw.department_id;

    // Check for an existing active approval for this document
    const existingRequest = await repo.findActiveRequest(userCtx, docType, docId);
    
    if (existingRequest) {
        // If it's in_progress, block duplicate UNLESS it's a corrupted draft
        if (existingRequest.current_status === "in_progress") {
            const isSelfCorrectableDraft = docType === "PR" && 
                await prisma.purchaseRequisition.findFirst({
                    where: { id: docId, status: { in: ["draft", "sent_back"] } }
                });

            if (isSelfCorrectableDraft) {
                console.log(`[APPROV-ENGINE] Force superseding corrupted in_progress request ${existingRequest.id}.`);
                await prisma.approvalRequest.update({
                    where: { id: existingRequest.id },
                    data: { current_status: "cancelled", is_completed: true, completed_at: new Date() }
                });
                await prisma.approvalStep.updateMany({
                    where: { approval_request_id: existingRequest.id, status: "pending" },
                    data: { status: "skipped" }
                });
            } else {
                throw createAppError(
                    `An active approval request already exists for this document (status: ${existingRequest.current_status})`,
                    409
                );
            }
        }
        
        // If it's sent_back, we supersede it with a new cycle
        if (existingRequest.current_status === "sent_back" || existingRequest.current_status === "draft") {
            console.log(`[APPROV-ENGINE] Superseding old ${existingRequest.current_status} request ${existingRequest.id} for ${docType} ${docId} with a new cycle.`);
            await prisma.approvalRequest.update({
                where: { id: existingRequest.id },
                data: { 
                    current_status: "cancelled", 
                    is_completed: true, 
                    completed_at: new Date() 
                }
            });
            // Skip remaining steps of the old request
            await prisma.approvalStep.updateMany({
                where: { approval_request_id: existingRequest.id, status: "pending" },
                data: { status: "skipped" }
            });
        }
    }

    // Load matching approval matrices
    const numericAmount = Number(amount) || 0;
    const matrices = await repo.findMatrices(userCtx, docType, projectId, numericAmount, departmentId);
    if (!matrices || matrices.length === 0) {
        const projectDisplay = projectId || "Global/None";
        logger.warn(`Approval Matrix not found: docType=${docType}, projectId=${projectDisplay}, amount=${numericAmount}, departmentId=${departmentId}`);
        // Log all matrices for this docType to debug
        const allForDoc = await prisma.approvalMatrix.findMany({ where: { doc_type: docType } });
        logger.debug(`Existing matrices for ${docType}:`, allForDoc);

        throw createAppError(
            `No approval matrix configured for docType='${docType}', projectId='${projectDisplay}', amount=${numericAmount}. Contact the ERP administrator.`,
            422
        );
    }

    // Resolve distinct step orders (for totalSteps count)
    const uniqueStepOrders = [...new Set(matrices.map((m) => m.step_order))].sort((a, b) => a - b);
    const firstStepOrder = uniqueStepOrders[0];

    // Build the steps to create
    const stepInserts = [];
    for (const matrix of matrices) {
        const resolved = await resolveApprover(matrix.role_id, actorId, departmentId, userCtx.companyId);
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
                company_id: userCtx.companyId,
                project_id: projectId || null,
                requested_by: actorId,
                department_id: departmentId || null,
                current_status: "in_progress",
                total_steps: uniqueStepOrders.length,
                current_step: firstStepOrder,
                amount: numericAmount,
                attachment_url: data.attachmentUrl || null,
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

        // Create items if present
        if (items && Array.isArray(items) && items.length > 0) {
            await tx.approvalRequestItem.createMany({
                data: items.map(item => ({
                    approval_request_id: req.id,
                    item_name: item.itemName,
                    quantity: item.quantity ? Number(item.quantity) : null,
                    unit: item.unit || null,
                    unit_price: item.unitPrice ? Number(item.unitPrice) : null,
                    total_price: item.totalPrice ? Number(item.totalPrice) : null,
                    remarks: item.remarks || null
                }))
            });
        }

        return req;
    });

    // Update document status → submitted / in_approval
    try {
        await updateDocumentStatus(
            { docType, docId, status: "in_approval" }, 
            { id: actorId, companyId }
        );

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

async function getInbox(userCtx, statusFilter, page = 1, pageSize = 10, reqDepartmentId = null) {
    const userId = userCtx.id;
    const skip = (page - 1) * pageSize;
    const user = await repo.findUserById(userId);
    if (!user) throw createAppError("User not found", 404);

    const now = new Date();
    const filter = statusFilter || "pending";
    const roleCode = (user.roles?.code || "").toLowerCase();
    const isAdmin = roleCode === "super_admin" || roleCode === "erp_admin";
    const departmentId = isAdmin ? (reqDepartmentId || null) : user.department_id;

    let ownSteps = [];
    if (filter === "sent") {
        const requests = await repo.findSentRequests(userCtx);

        return {
            data: requests.map(r => ({
                id: r.id,
                approvalRequestId: r.id,
                docType: r.doc_type,
                docId: r.doc_id,
                projectId: r.project_id,
                projectName: r.project?.name || "Global",
                requestedBy: r.requested_by,
                requestedByName: user.name,
                currentStatus: r.current_status,
                totalSteps: r.total_steps,
                currentStep: r.current_step,
                submittedAt: r.created_at,
                amount: r.amount,
                departmentId: r.department_id || user.department_id,
                department: r.department?.name || user.departments?.name || "Unassigned"
            })),
            total: requests.length, page, pageSize
        };
    }

    // New: Allow Admins to see all sent requests (Isolated by company)
    if (isAdmin && filter === "all_sent") {
        const where = { };
        if (roleCode === "erp_admin" && user.company_id) {
            where.requestedByRel = { company_id: user.company_id };
        }
        if (departmentId) {
            where.department_id = departmentId;
        }
        
        const [total, requests] = await Promise.all([
            prisma.approvalRequest.count({ where }),
            prisma.approvalRequest.findMany({
                where,
                include: {
                    project: { select: { id: true, name: true, code: true } },
                    department: { select: { id: true, name: true, code: true } },
                    requestedByRel: { select: { name: true } }
                },
                orderBy: { created_at: "desc" },
                skip,
                take: pageSize,
            })
        ]);

        return {
            data: requests.map(r => ({
                id: r.id,
                approvalRequestId: r.id,
                docType: r.doc_type,
                docId: r.doc_id,
                projectId: r.project_id,
                projectName: r.project?.name || "Global",
                requestedBy: r.requested_by,
                requestedByName: r.requestedByRel?.name || "Unknown",
                currentStatus: r.current_status,
                totalSteps: r.total_steps,
                currentStep: r.current_step,
                submittedAt: r.created_at,
                amount: r.amount,
                departmentId: r.department_id,
                department: r.department?.name || "Unassigned"
            })),
            total, page, pageSize
        };
    }

    if (isAdmin && (filter === "pending" || filter === "approved" || filter === "rejected")) {
        // Admins see all steps matching the status system-wide (Superadmin) or company-wide (ERP Admin)
        const where = { status: filter };
        
        if (roleCode === "erp_admin" && user.company_id) {
            where.approval_requests = {
                is: { requestedByRel: { company_id: user.company_id } }
            };
        }
        if (departmentId) {
            where.approval_requests = {
                ...where.approval_requests,
                is: {
                    ...(where.approval_requests?.is || {}),
                    department_id: departmentId 
                }
            };
        }

        let adminSteps = await prisma.approvalStep.findMany({
            where,
            orderBy: { step_order: "asc" },
            include: {
                roles: { select: { id: true, name: true, code: true } },
                approval_requests: {
                    include: {
                        project: { select: { id: true, name: true, code: true } },
                        department: { select: { id: true, name: true, code: true } },
                        requestedByRel: { select: { name: true } }
                    }
                }
            }
        });

        // For pending: only show steps at the current step order (sequential guard)
        if (filter === "pending") {
            adminSteps = adminSteps.filter(s => {
                const req = s.approval_requests;
                if (!req) return false;
                return s.step_order === req.current_step;
            });
        }

        ownSteps = adminSteps;
    } else {
        // 1. Own steps (direct assignment OR role match)
        ownSteps = await repo.findInboxSteps(userCtx, user.role_id, filter, departmentId);
    }

    // 2. Delegated steps (unless we already fetched everything as admin)
    let delegatedSteps = [];
    if (!isAdmin || filter !== "pending") {
        const activeDelegations = await repo.findDelegationsForInbox(userId, now);
        const delegatorIds = activeDelegations.map((d) => d.from_user);

        for (const delegatorId of delegatorIds) {
            const delegator = await repo.findUserById(delegatorId);
            if (!delegator) continue;
            const steps = await repo.findInboxSteps(userCtx, delegator.role_id, filter, delegator.department_id);
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

    // 4. Final mapping (Requester info is already joined in findInboxSteps for non-admins 
    // and in the adminSteps block for admins)
    const data = merged.map((s) => {
        const req = s.approval_requests;
        return {
            stepId: s.id,
            approvalRequestId: s.approval_request_id,
            docType: req?.doc_type,
            docId: req?.doc_id,
            projectId: req?.project_id,
            projectName: req?.project?.name || "Global",
            departmentId: req?.department_id,
            department: req?.department?.name || "Unassigned",
            requestedBy: req?.requested_by,
            requestedByName: req?.requestedByRel?.name || "Personnel",
            stepOrder: s.step_order,
            totalSteps: req?.total_steps,
            role: s.roles ? { name: s.roles.name, code: s.roles.code } : null,
            approverUser: s.approver_user,
            status: s.status,
            submittedAt: req?.created_at,
            escalated: s.escalated,
            delegatedFrom: s._delegatedFrom || null,
        };
    });

    const total = data.length;
    const paginated = data.slice(skip, skip + pageSize);

    return { data: paginated, total, page, pageSize };
}

// ─── 3. Approve Step ──────────────────────────────────────────────────────────

async function approveStep(approvalRequestId, userCtx, remarks, ipAddress, deviceInfo) {
    const actorId = userCtx.id;
    const actor = await repo.findUserById(actorId);
    if (!actor) throw createAppError("Actor user not found", 404);

    const request = await repo.findRequestWithSteps(approvalRequestId);
    if (!request) throw createAppError("Approval request not found", 404);
    if (request.current_status !== "in_progress") {
        throw createAppError(`Cannot approve — request is already '${request.current_status}'`, 409);
    }

    // Self-approval block (Creator cannot approve their own document)
    // Mandatory Escalation: requester cannot approve even if they are Admin.
    if (request.requested_by === actorId) {
        logger.warn(`Self-approval blocked for user='${actorId}' on request='${approvalRequestId}'`);
        throw createAppError("Self-approval is strictly prohibited. This request must be approved by another authorized personnel or escalated to a higher administrator.", 403);
    }

    const roleCode = (actor.roles?.code || "").toLowerCase();
    const isAdmin = roleCode === "super_admin" || roleCode === "erp_admin";

    // Find the step(s) this user can act on at the current step_order
    // Also allow if actor is an active delegate of the step's assigned approver
    const now = new Date();
    const activeDelegations = await repo.findDelegationsForInbox(actorId, now);
    const delegatorIds = new Set(activeDelegations.map((d) => d.from_user));

    const actableSteps = request.approval_steps.filter((s) => {
        if (s.step_order !== request.current_step) return false;
        if (s.status !== "pending") return false;

        const roleCode = (actor.roles?.code || "").toLowerCase();
        const isAdmin = roleCode === "super_admin" || roleCode === "erp_admin";
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
        await updateDocumentStatus(
            { docType: request.doc_type, docId: request.doc_id, status: "approved" },
            { id: actorId, companyId: request.company_id }
        );
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

async function rejectStep(approvalRequestId, userCtx, remarks, ipAddress, deviceInfo) {
    const actorId = userCtx.id;
    if (!remarks || !remarks.trim()) {
        throw createAppError("Rejection reason is mandatory.", 400);
    }

    const actor = await repo.findUserById(actorId);
    if (!actor) throw createAppError("Actor user not found", 404);

    const request = await repo.findRequestWithSteps(approvalRequestId);
    if (!request) throw createAppError("Approval request not found", 404);
    if (request.current_status !== "in_progress") {
        throw createAppError(`Cannot reject — request is already '${request.current_status}'`, 409);
    }

    // Self-rejection not meaningful but still allowed (different from self-approval)
    const roleCode = (actor.roles?.code || "").toLowerCase();
    const isAdmin = roleCode === "super_admin" || roleCode === "erp_admin";

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

    await updateDocumentStatus(
        { docType: request.doc_type, docId: request.doc_id, status: "rejected" },
        { id: actorId, companyId: request.company_id }
    );

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

// ─── 4.5. Send Back Step ─────────────────────────────────────────────────────────

async function sendBackStep(approvalRequestId, userCtx, remarks, ipAddress, deviceInfo) {
    const actorId = userCtx.id;
    if (!remarks || !remarks.trim()) {
        throw createAppError("Reason for sending back is mandatory.", 400);
    }

    const actor = await repo.findUserById(actorId);
    if (!actor) throw createAppError("Actor user not found", 404);

    const request = await repo.findRequestWithSteps(approvalRequestId);
    if (!request) throw createAppError("Approval request not found", 404);
    if (request.current_status !== "in_progress") {
        throw createAppError(`Cannot send back — request is already '${request.current_status}'`, 409);
    }

    const roleCode = (actor.roles?.code || "").toLowerCase();
    const isAdmin = roleCode === "super_admin" || roleCode === "erp_admin";

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
        // Mark the step as sent_back
        await tx.approvalStep.update({
            where: { id: actableStep.id },
            data: {
                status: "sent_back",
                action: "send_back",
                remarks: remarks || null,
                approved_at: now,
                approver_user: actorId,
            },
        });

        // Send back cascades to the entire request (halted but not terminally rejected)
        await tx.approvalRequest.update({
            where: { id: approvalRequestId },
            data: {
                current_status: "sent_back",
                is_completed: false,
                completed_at: null,
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

    await updateDocumentStatus(
        { docType: request.doc_type, docId: request.doc_id, status: "sent_back" },
        { id: actorId, companyId: request.company_id }
    );

    await logAudit({
        userId: actorId,
        module: "approvals",
        entity: "approval_step",
        entityId: approvalRequestId,
        action: "SEND_BACK_STEP",
        beforeData: { step: request.current_step, status: "pending" },
        afterData: { status: "sent_back", remarks },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Step sent_back: request=${approvalRequestId} by=${actorId} at step=${request.current_step}`);

    return { approvalRequestId, currentStatus: "sent_back" };
}

// ─── 5. Approval History ──────────────────────────────────────────────────────

async function getHistory(docType, docId, userCtx) {
    const records = await repo.findHistoryByDoc(userCtx, docType, docId);
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

async function cancelApproval(approvalRequestId, userCtx, ipAddress, deviceInfo) {
    const actorId = userCtx.id;
    const actor = await repo.findUserById(actorId);
    if (!actor) throw createAppError("User not found", 404);

    const request = await repo.findRequestById(approvalRequestId);
    if (!request) throw createAppError("Approval request not found", 404);
    if (request.current_status !== "in_progress") {
        throw createAppError(`Cannot cancel — request is '${request.current_status}'`, 409);
    }

    // Only requester or system admin (is_system_role) can cancel
    const isRequester = request.requested_by === actorId;
    const roleCode = (actor.roles?.code || "").toLowerCase();
    const isAdmin = roleCode === "super_admin" || roleCode === "erp_admin";
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

    await updateDocumentStatus(
        { docType: request.doc_type, docId: request.doc_id, status: "cancelled" },
        { id: actorId, companyId: request.company_id }
    );

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

    // ─── Fetch Extended Document-Specific Data ─────────────────────────────────
    let extendedData = null;
    try {
        if (r.doc_type === "DPR") {
            extendedData = await prisma.dPR.findUnique({
                where: { id: r.doc_id },
                include: {
                    resource_logs: {
                        include: {
                            employee: { select: { name: true } },
                            equipment: { select: { name: true, equipment_no: true } }
                        }
                    },
                    hindrances: true,
                    project: { select: { name: true, code: true } },
                    creator: { select: { name: true } }
                }
            });
        } else if (r.doc_type === "PO") {
            extendedData = await prisma.purchaseOrder.findUnique({
                where: { id: r.doc_id },
                include: {
                    vendor: true,
                    project: { select: { name: true } },
                    items: {
                        include: { catalog_item: { select: { name: true, description: true } } }
                    }
                }
            });
        } else if (r.doc_type === "PR") {
            extendedData = await prisma.purchaseRequisition.findUnique({
                where: { id: r.doc_id },
                include: {
                    project: { select: { name: true } },
                    items: {
                        include: { catalog_item: { select: { name: true, description: true } } }
                    }
                }
            });
        }
    } catch (err) {
        logger.warn(`Failed to fetch extendedData for ${r.doc_type}: ${err.message}`);
    }

    const items = await prisma.approvalRequestItem.findMany({
        where: { approval_request_id: id }
    });

    const requester = await prisma.user.findUnique({
        where: { id: r.requested_by },
        select: { name: true, department_id: true, departments: { select: { name: true } } }
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
        departmentId: r.department_id || requester?.department_id,
        department: r.departments?.name || requester?.departments?.name || "Unassigned",
        requestedBy: r.requested_by,
        requestedByName: requester?.name || "Unknown",
        currentStatus: r.current_status,
        amount: r.amount,
        totalSteps: r.total_steps,
        currentStep: r.current_step,
        isCompleted: r.is_completed,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        attachment_url: r.attachment_url,
        steps: steps,
        items: items,
        extendedData: extendedData,
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    requestApproval,
    getInbox,
    approveStep,
    rejectStep,
    sendBackStep,
    getHistory,
    cancelApproval,
    getRequestById,
};
