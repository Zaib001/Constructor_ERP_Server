"use strict";

/**
 * sanitize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Strips sensitive fields from objects before they are written to audit logs.
 * Works recursively so nested objects (e.g. included relations) are also cleaned.
 *
 * Sensitive keys (case-insensitive match):
 *   password_hash, password, jwt_token, token, reset_token, secret, api_key
 */

const SENSITIVE_KEYS = new Set([
    "password_hash",
    "password",
    "jwt_token",
    "token",
    "reset_token",
    "secret",
    "api_key",
    "access_token",
    "refresh_token",
    "authorization",
]);

/**
 * Recursively sanitize an object, removing sensitive keys.
 * Returns a new object — does NOT mutate the original.
 *
 * @param {*} obj  - Any value (object, array, primitive)
 * @returns {*}    - Sanitized copy
 */
function sanitizeAuditData(obj) {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
        return obj.map(sanitizeAuditData);
    }

    if (typeof obj === "object" && !(obj instanceof Date)) {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (SENSITIVE_KEYS.has(key.toLowerCase())) {
                sanitized[key] = "[REDACTED]";
            } else {
                sanitized[key] = sanitizeAuditData(value);
            }
        }
        return sanitized;
    }

    // Primitives and Dates pass through unchanged
    return obj;
}

module.exports = { sanitizeAuditData };
