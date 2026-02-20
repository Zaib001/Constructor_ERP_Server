"use strict";

const service = require("./session.service");

function getIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || null;
}

function getDevice(req) {
    return req.headers["user-agent"] || null;
}

/**
 * GET /api/sessions/my
 */
async function getMySessions(req, res, next) {
    try {
        const sessions = await service.getUserSessions(req.user.userId);
        res.status(200).json({
            success: true,
            data: sessions,
        });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/sessions/:sessionId
 */
async function revokeSession(req, res, next) {
    try {
        await service.revokeSession(
            req.params.sessionId,
            req.user.userId,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );
        res.status(200).json({
            success: true,
            message: "Session revoked successfully",
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/sessions/terminate-others
 */
async function terminateOtherSessions(req, res, next) {
    try {
        const result = await service.terminateOtherSessions(
            req.user.sessionId,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );
        res.status(200).json({
            success: true,
            message: `Terminated ${result.terminatedCount} other active sessions`,
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/sessions/admin/logout-user
 */
async function adminLogoutUser(req, res, next) {
    try {
        const result = await service.adminLogoutUser(
            req.body.userId,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );
        res.status(200).json({
            success: true,
            message: `Successfully logged out user from ${result.terminatedCount} sessions`,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getMySessions,
    revokeSession,
    terminateOtherSessions,
    adminLogoutUser,
};
