"use strict";

/**
 * response.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standardized API response helpers.
 *
 * All ERP endpoints should use these helpers for consistent shape:
 *
 * Success: { success: true, message, data }
 * Error:   { success: false, message, errors, requestId }
 */

/**
 * Send a standardized success response.
 *
 * @param {object}  res         - Express response object
 * @param {*}       data        - Response payload
 * @param {string}  [message]   - Optional human-readable message
 * @param {number}  [status]    - HTTP status code (default 200)
 */
function ok(res, data, message = "Success", status = 200) {
    return res.status(status).json({
        success: true,
        message,
        data,
    });
}

/**
 * Send a standardized error response.
 *
 * @param {object}   res        - Express response object
 * @param {number}   status     - HTTP status code
 * @param {string}   message    - Human-readable error message
 * @param {Array}    [errors]   - Array of field-level errors (for validation)
 */
function fail(res, status, message, errors = []) {
    const body = {
        success: false,
        message,
    };

    if (errors.length > 0) {
        body.errors = errors;
    }

    // Include requestId if available (set by requestContext middleware)
    if (res.req?.context?.requestId) {
        body.requestId = res.req.context.requestId;
    }

    return res.status(status).json(body);
}

module.exports = { ok, fail };
