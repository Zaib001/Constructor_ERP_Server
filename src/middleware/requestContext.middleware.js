"use strict";

const { randomUUID } = require("node:crypto");
const { contextStorage } = require("../utils/context");

/**
 * requestContext middleware using AsyncLocalStorage for global tracing
 */
function requestContext(req, res, next) {
    const requestId = req.headers["x-request-id"] || randomUUID();
    const correlationId = req.headers["x-correlation-id"] || requestId;
    const ipAddress =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip ||
        null;
    const deviceInfo = req.headers["user-agent"] || null;

    req.context = {
        requestId,
        correlationId,
        ipAddress,
        deviceInfo,
        startTime: Date.now(),
    };

    res.setHeader("x-request-id", requestId);
    res.setHeader("x-correlation-id", correlationId);

    const store = {
        requestId,
        correlationId,
        ipAddress,
        deviceInfo,
        userId: null,
        companyId: null
    };

    contextStorage.run(store, () => {
        next();
    });
}

module.exports = requestContext;
