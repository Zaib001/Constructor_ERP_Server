"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * requestContext middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a unique requestId for every incoming HTTP request and attaches
 * context data that flows through the entire request lifecycle.
 *
 * Attaches to req:
 *   req.context = { requestId, ipAddress, deviceInfo, startTime }
 *
 * Sets response header:
 *   x-request-id: <uuid>
 *
 * Mount this FIRST in app.js before all routes and other middleware.
 */
function requestContext(req, res, next) {
    const requestId = uuidv4();
    const ipAddress =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip ||
        null;
    const deviceInfo = req.headers["user-agent"] || null;

    req.context = {
        requestId,
        ipAddress,
        deviceInfo,
        startTime: Date.now(),
    };

    // Expose requestId to clients so they can correlate errors with support
    res.setHeader("x-request-id", requestId);

    next();
}

module.exports = requestContext;
