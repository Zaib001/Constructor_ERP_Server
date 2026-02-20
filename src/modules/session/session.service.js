"use strict";

const prisma = require("../../db");
const logger = require("../../logger");
const { logAudit } = require("../../utils/auditLogger");

/**
 * Get all active sessions for a user.
 */
async function getUserSessions(userId) {
    return prisma.userSession.findMany({
        where: {
            user_id: userId,
            is_active: true,
        },
        select: {
            id: true,
            ip_address: true,
            device_info: true,
            login_time: true,
        },
        orderBy: {
            login_time: "desc",
        },
    });
}

/**
 * Deactivate a specific session.
 */
async function revokeSession(sessionId, userId, actorId, ipAddress, deviceInfo) {
    const session = await prisma.userSession.findFirst({
        where: {
            id: sessionId,
            user_id: userId,
            is_active: true,
        },
    });

    if (!session) {
        const error = new Error("Active session not found or already revoked");
        error.statusCode = 404;
        throw error;
    }

    await prisma.userSession.update({
        where: { id: sessionId },
        data: {
            is_active: false,
            logout_time: new Date(),
        },
    });

    await logAudit({
        userId: actorId,
        module: "session",
        entity: "user_session",
        entityId: sessionId,
        action: "REVOKE_SESSION",
        beforeData: { is_active: true },
        afterData: { is_active: false, logout_time: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Session revoked: ${sessionId} for user: ${userId}`);
}

/**
 * Deactivate all other sessions except the current one.
 */
async function terminateOtherSessions(currentSessionId, userId, ipAddress, deviceInfo) {
    const result = await prisma.userSession.updateMany({
        where: {
            user_id: userId,
            id: { not: currentSessionId },
            is_active: true,
        },
        data: {
            is_active: false,
            logout_time: new Date(),
        },
    });

    await logAudit({
        userId,
        module: "session",
        entity: "user_session",
        entityId: userId,
        action: "TERMINATE_OTHER_SESSIONS",
        beforeData: { active_sessions_count: result.count },
        afterData: { is_active: false },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Terminated ${result.count} other sessions for user: ${userId}`);
    return { terminatedCount: result.count };
}

/**
 * Admin force logout of all sessions for a user.
 */
async function adminLogoutUser(targetUserId, actorId, ipAddress, deviceInfo) {
    const result = await prisma.userSession.updateMany({
        where: {
            user_id: targetUserId,
            is_active: true,
        },
        data: {
            is_active: false,
            logout_time: new Date(),
        },
    });

    await logAudit({
        userId: actorId,
        module: "session",
        entity: "user",
        entityId: targetUserId,
        action: "ADMIN_FORCE_LOGOUT",
        beforeData: { active_sessions_count: result.count },
        afterData: { is_active: false },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Admin ${actorId} forced logout for user ${targetUserId}. ${result.count} sessions terminated.`);
    return { terminatedCount: result.count };
}

module.exports = {
    getUserSessions,
    revokeSession,
    terminateOtherSessions,
    adminLogoutUser,
};
