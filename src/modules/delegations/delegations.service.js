"use strict";

const prisma = require("../../db");
const logger = require("../../logger");
const { logAudit } = require("../../utils/auditLogger");

function createAppError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ─── Create Delegation ────────────────────────────────────────────────────────

async function createDelegation({ fromUser, toUser, startDate, endDate }, actorId, ipAddress, deviceInfo) {
    // 1. Self-delegation guard
    if (fromUser === toUser) {
        throw createAppError("A user cannot delegate to themselves", 400);
    }

    // 2. Both users must exist
    const [from, to] = await Promise.all([
        prisma.user.findFirst({ where: { id: fromUser, deleted_at: null, is_active: true }, select: { id: true, name: true } }),
        prisma.user.findFirst({ where: { id: toUser, deleted_at: null, is_active: true }, select: { id: true, name: true } }),
    ]);
    if (!from) throw createAppError(`fromUser '${fromUser}' not found or inactive`, 404);
    if (!to) throw createAppError(`toUser '${toUser}' not found or inactive`, 404);

    // 3. Circular delegation guard: check if toUser already delegates to fromUser
    const circular = await prisma.approvalDelegation.findFirst({
        where: {
            from_user: toUser,
            to_user: fromUser,
            is_active: true,
            end_date: { gte: new Date() },
        },
    });
    if (circular) {
        throw createAppError("Circular delegation detected — the target user already delegates back to this user", 409);
    }

    // 4. Overlap check: same fromUser cannot have two active overlapping delegations
    const overlap = await prisma.approvalDelegation.findFirst({
        where: {
            from_user: fromUser,
            is_active: true,
            AND: [
                { start_date: { lte: new Date(endDate) } },
                { end_date: { gte: new Date(startDate) } },
            ],
        },
    });
    if (overlap) {
        throw createAppError("An active delegation for this user already overlaps with the requested period", 409);
    }

    // 5. Create
    const delegation = await prisma.approvalDelegation.create({
        data: {
            from_user: fromUser,
            to_user: toUser,
            start_date: new Date(startDate),
            end_date: new Date(endDate),
            is_active: true,
        },
    });

    await logAudit({
        userId: actorId,
        module: "delegation",
        entity: "approval_delegation",
        entityId: delegation.id,
        action: "CREATE",
        beforeData: null,
        afterData: { fromUser, toUser, startDate, endDate },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Delegation created: ${from.name} → ${to.name} (${startDate} to ${endDate})`);
    return delegation;
}

// ─── Get Delegations ──────────────────────────────────────────────────────────

async function getDelegations({ userId, active } = {}) {
    const where = {};

    if (userId) {
        where.OR = [{ from_user: userId }, { to_user: userId }];
    }

    if (active === "true" || active === true) {
        const now = new Date();
        where.is_active = true;
        where.start_date = { lte: now };
        where.end_date = { gte: now };
    }

    return prisma.approvalDelegation.findMany({
        where,
        orderBy: { start_date: "desc" },
    });
}

// ─── Disable Delegation ────────────────────────────────────────────────────────

async function disableDelegation(id, actorId, ipAddress, deviceInfo) {
    const delegation = await prisma.approvalDelegation.findFirst({ where: { id } });
    if (!delegation) throw createAppError("Delegation not found", 404);
    if (!delegation.is_active) throw createAppError("Delegation is already disabled", 409);

    const updated = await prisma.approvalDelegation.update({
        where: { id },
        data: { is_active: false },
    });

    await logAudit({
        userId: actorId,
        module: "delegation",
        entity: "approval_delegation",
        entityId: id,
        action: "DISABLE",
        beforeData: { is_active: true },
        afterData: { is_active: false },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Delegation ${id} disabled by ${actorId}`);
    return updated;
}

module.exports = { createDelegation, getDelegations, disableDelegation };
