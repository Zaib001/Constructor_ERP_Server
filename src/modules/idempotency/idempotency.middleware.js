"use strict";

const { checkIdempotency, saveIdempotency, hashBody } = require("./idempotency.service");
const logger = require("../../logger");

/**
 * idempotent()
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware factory for idempotency checks on critical write endpoints.
 *
 * Reads the `Idempotency-Key` header. If present:
 *   - Checks DB for a previous request with same key + user + route + body hash
 *   - If found with same payload → returns cached response (200, replay)
 *   - If found with different payload → returns 409 Conflict
 *   - If not found → lets request proceed; after controller runs, saves response
 *
 * If `Idempotency-Key` header is absent → no-op, request proceeds normally.
 *
 * Usage:
 *   router.post("/:id/approve", authenticateJWT, idempotent(), controller.approve)
 */
function idempotent() {
    return async function (req, res, next) {
        const idemKey = req.headers["idempotency-key"];

        if (!idemKey) {
            return next(); // No idempotency key — proceed normally
        }

        const userId = req.user?.userId || null;
        const route = req.originalUrl || req.url;
        const reqHash = hashBody(req.body);

        const { conflict, cached } = await checkIdempotency(idemKey, userId, route, reqHash);

        if (conflict) {
            return res.status(409).json({
                success: false,
                message: "Idempotency conflict: this key was already used with a different request payload",
                requestId: req.context?.requestId,
            });
        }

        if (cached) {
            logger.info(`Idempotency replay: key=${idemKey} route=${route}`);
            return res.status(200).json(cached);
        }

        // Intercept res.json to capture the response body for caching
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            // Save only successful responses (2xx)
            if (res.statusCode >= 200 && res.statusCode < 300) {
                saveIdempotency(idemKey, userId, route, reqHash, body).catch(() => { });
            }
            return originalJson(body);
        };

        next();
    };
}

module.exports = idempotent;
