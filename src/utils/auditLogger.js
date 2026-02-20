"use strict";

const prisma = require("../db");
const logger = require("../logger");
const { sanitizeAuditData } = require("./sanitize");

/**
 * Write a record to audit.audit_logs.
 * This function never throws — failures are logged to Winston only.
 *
 * @param {Object} params
 * @param {string|null} params.userId      - UUID of the acting user (null for unauthenticated)
 * @param {string}      params.module      - module name, e.g. "auth"
 * @param {string}      params.entity      - entity type, e.g. "user"
 * @param {string|null} params.entityId    - UUID of the affected record
 * @param {string}      params.action      - action label, e.g. "LOGIN", "REGISTER"
 * @param {Object|null} params.beforeData  - snapshot before the change (will be sanitized)
 * @param {Object|null} params.afterData   - snapshot after the change (will be sanitized)
 * @param {string|null} params.ipAddress   - caller IP address
 * @param {string|null} params.deviceInfo  - User-Agent string
 * @param {string|null} params.requestId   - from req.context.requestId for traceability
 */
async function logAudit({
    userId = null,
    module,
    entity,
    entityId = null,
    action,
    beforeData = null,
    afterData = null,
    ipAddress = null,
    deviceInfo = null,
    requestId = null,
}) {
    try {
        const safeBeforeData = sanitizeAuditData(beforeData);
        const safeAfterData = sanitizeAuditData(afterData);

        await prisma.auditLog.create({
            data: {
                user_id: userId,
                module,
                entity,
                entity_id: entityId,
                action,
                before_data: safeBeforeData ? { ...safeBeforeData, _requestId: requestId } : (requestId ? { _requestId: requestId } : null),
                after_data: safeAfterData,
                ip_address: ipAddress,
                device_info: deviceInfo,
            },
        });
    } catch (err) {
        // Audit failures must NOT break business logic
        logger.error("auditLogger: failed to write audit log", {
            error: err.message,
            userId,
            module,
            entity,
            action,
            requestId,
        });
    }
}

module.exports = { logAudit };

