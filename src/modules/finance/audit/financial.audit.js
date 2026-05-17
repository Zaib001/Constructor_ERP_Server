"use strict";

/**
 * financial.audit.js — Immutable Financial Audit Trail
 * Append-only. Never update or delete FinancialAuditLog rows.
 */

const prisma  = require("../../../db");
const logger  = require("../../../logger");

/**
 * Log a financial mutation event.
 * @param {object} p
 * @param {string}  p.companyId
 * @param {string}  p.userId
 * @param {string}  p.action      - e.g. "INVOICE_POSTED", "ZATCA_RETRY"
 * @param {string}  p.entityType  - e.g. "ClientInvoice"
 * @param {string}  p.entityId
 * @param {object}  [p.before]    - State before mutation
 * @param {object}  [p.after]     - State after mutation
 * @param {object}  [p.meta]      - { requestId, ip }
 */
async function logFinancialMutation({ companyId, userId, action, entityType, entityId, before, after, meta }) {
    try {
        await prisma.financialAuditLog.create({
            data: {
                company_id:   companyId,
                user_id:      userId     || null,
                action,
                entity_type:  entityType,
                entity_id:    String(entityId),
                before_state: before    || null,
                after_state:  after     || null,
                meta:         meta      || null,
            }
        });
    } catch (err) {
        // Never let audit failures crash the main flow
        logger.error("[FinancialAudit] Failed to write audit log", { action, entityType, entityId, err: err.message });
    }
}

module.exports = { logFinancialMutation };
