"use strict";

const crypto = require("crypto");
const prisma = require("../../db");
const logger = require("../../logger");

/**
 * Hash request body for equality comparison.
 * SHA-256, first 64 hex chars.
 */
function hashBody(body) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(body ?? {}))
        .digest("hex")
        .substring(0, 64);
}

/**
 * Check if an idempotency key was already used.
 * Returns cached responseBody or null.
 *
 * @param {string} key        - Idempotency-Key header value
 * @param {string} userId     - Authenticated user ID
 * @param {string} route      - Request route (e.g. "/api/approvals/123/approve")
 * @param {string} requestHash - SHA-256 of request body
 * @returns {{ conflict: boolean, cached: object|null }}
 */
async function checkIdempotency(key, userId, route, requestHash) {
    try {
        const existing = await prisma.idempotencyKey.findUnique({
            where: { key },
        });

        if (!existing) return { conflict: false, cached: null };

        // Key found — check if it's expired
        if (existing.expires_at < new Date()) {
            // Expired key — treat as new
            await prisma.idempotencyKey.delete({ where: { key } });
            return { conflict: false, cached: null };
        }

        // Same payload? Return cached response
        if (existing.request_hash === requestHash) {
            return { conflict: false, cached: existing.response_body };
        }

        // Different payload with same key — conflict
        return { conflict: true, cached: null };
    } catch (err) {
        logger.error("idempotency.service checkIdempotency error:", { error: err.message, key });
        return { conflict: false, cached: null }; // Fail open — let request proceed
    }
}

/**
 * Save an idempotency key after successful response.
 *
 * @param {string} key          - Idempotency-Key header value
 * @param {string} userId       - Authenticated user ID
 * @param {string} route        - Request route
 * @param {string} requestHash  - SHA-256 of request body
 * @param {object} responseBody - Response sent to client (saved for replay)
 * @param {number} ttlMinutes   - Cache duration (default 24h)
 */
async function saveIdempotency(key, userId, route, requestHash, responseBody, ttlMinutes = 1440) {
    try {
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
        await prisma.idempotencyKey.upsert({
            where: { key },
            create: { key, user_id: userId, route, request_hash: requestHash, response_body: responseBody, expires_at: expiresAt },
            update: { response_body: responseBody },
        });
    } catch (err) {
        logger.error("idempotency.service saveIdempotency error:", { error: err.message, key });
    }
}

module.exports = { checkIdempotency, saveIdempotency, hashBody };
