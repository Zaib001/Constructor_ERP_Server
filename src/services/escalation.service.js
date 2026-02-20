"use strict";

const prisma = require("../db");
const logger = require("../logger");
const { logAudit } = require("../utils/auditLogger");
const { logSystem } = require("../modules/systemLogs/systemLogs.service");

// ─── Escalation Target Resolver ───────────────────────────────────────────────

/**
 * Resolve who should be escalated to, in priority order:
 *  1. The approver user's manager (manager_id on auth.users)
 *  2. First active Admin-role user (role.code = 'SUPER_ADMIN')
 *  3. null (log a warning, no one to escalate to)
 */
async function resolveEscalationTarget(approverUserId) {
    if (approverUserId) {
        const approver = await prisma.user.findFirst({
            where: { id: approverUserId, deleted_at: null },
            select: { manager_id: true },
        });

        if (approver?.manager_id) {
            const manager = await prisma.user.findFirst({
                where: { id: approver.manager_id, is_active: true, deleted_at: null },
                select: { id: true },
            });
            if (manager) return manager.id;
        }
    }

    // Fallback: first Super Admin
    const adminRole = await prisma.role.findFirst({
        where: { code: "SUPER_ADMIN", is_active: true },
        select: { id: true },
    });
    if (!adminRole) return null;

    const admin = await prisma.user.findFirst({
        where: { role_id: adminRole.id, is_active: true, deleted_at: null },
        select: { id: true },
    });
    return admin?.id || null;
}

// ─── Main Escalation Runner ────────────────────────────────────────────────────

/**
 * runEscalation()
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds all pending approval steps whose parent request has exceeded the SLA
 * window defined in the approval matrix, and escalates them.
 *
 * Design constraints:
 *  - Idempotent: steps with escalated=true are skipped
 *  - Never auto-approves — only flags and records escalation
 *  - Fire-and-forget safe: errors are logged but do not crash the worker
 */
async function runEscalation() {
    const now = new Date();
    logger.info("[EscalationWorker] Running escalation check...");

    let escalatedCount = 0;
    let errorCount = 0;

    try {
        // Fetch pending steps that are not yet escalated
        const pendingSteps = await prisma.approvalStep.findMany({
            where: {
                status: "pending",
                escalated: false,
            },
            include: {
                approval_requests: {
                    select: {
                        id: true,
                        doc_type: true,
                        doc_id: true,
                        requested_by: true,
                        created_at: true,
                        current_status: true,
                    },
                },
            },
        });

        // Only process steps whose parent request is still in_progress
        const activePending = pendingSteps.filter(
            (s) => s.approval_requests?.current_status === "in_progress"
        );

        for (const step of activePending) {
            try {
                const request = step.approval_requests;
                if (!request?.created_at) continue;

                // Find the matrix row for this step to get escalation_hours
                const matrix = await prisma.approvalMatrix.findFirst({
                    where: {
                        doc_type: request.doc_type,
                        step_order: step.step_order,
                        escalation_hours: { not: null },
                    },
                    select: { escalation_hours: true, role_id: true },
                });

                if (!matrix?.escalation_hours) continue;

                // Compute age in hours
                const ageMs = now.getTime() - new Date(request.created_at).getTime();
                const ageHours = ageMs / (1000 * 60 * 60);

                if (ageHours < matrix.escalation_hours) continue;

                // Resolve escalation target
                const escalatedTo = await resolveEscalationTarget(step.approver_user);

                // Update step — idempotent because escalated=false was a filter
                await prisma.approvalStep.update({
                    where: { id: step.id },
                    data: {
                        escalated: true,
                        escalated_to: escalatedTo || null,
                    },
                });

                escalatedCount++;

                // System log
                logSystem({
                    level: "warn",
                    message: "Approval step escalated due to SLA breach",
                    context: {
                        stepId: step.id,
                        approvalRequestId: request.id,
                        docType: request.doc_type,
                        docId: request.doc_id,
                        stepOrder: step.step_order,
                        ageHours: ageHours.toFixed(2),
                        slaHours: matrix.escalation_hours,
                        escalatedTo,
                    },
                }).catch(() => { });

                // Audit log
                logAudit({
                    userId: null, // system-initiated
                    module: "approvals",
                    entity: "approval_step",
                    entityId: step.id,
                    action: "ESCALATED",
                    beforeData: { escalated: false, approverUser: step.approver_user },
                    afterData: { escalated: true, escalatedTo, ageHours: ageHours.toFixed(2), slaHours: matrix.escalation_hours },
                    ipAddress: "system",
                    deviceInfo: "escalation-worker",
                }).catch(() => { });

                logger.warn(
                    `[EscalationWorker] Escalated step ${step.id} for ${request.doc_type}/${request.doc_id} → ${escalatedTo || "unresolved"}`
                );
            } catch (stepErr) {
                errorCount++;
                logger.error(`[EscalationWorker] Error escalating step ${step.id}: ${stepErr.message}`);
            }
        }
    } catch (err) {
        logger.error(`[EscalationWorker] Fatal error: ${err.message}`, { stack: err.stack });
    }

    logger.info(`[EscalationWorker] Done — escalated=${escalatedCount} errors=${errorCount}`);
    return { escalatedCount, errorCount };
}

module.exports = { runEscalation, resolveEscalationTarget };
