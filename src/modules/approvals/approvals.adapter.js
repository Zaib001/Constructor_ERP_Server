"use strict";

/**
 * Document Status Adapter
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a pluggable interface for updating upstream document status when an
 * approval request is approved, rejected, or cancelled.
 *
 * Week 3+ procurement / finance modules call `registerAdapter()` at boot time
 * to plug in their real Prisma update logic.  Until then every call resolves
 * immediately with { success: true }.
 *
 * Usage (from a future module):
 *   const { registerAdapter } = require('../approvals/approvals.adapter');
 *   registerAdapter('PO', async ({ docId, status }) => {
 *     await prisma.purchaseOrder.update({ where: { id: docId }, data: { status } });
 *   });
 */

const logger = require("../../logger");

// Internal registry: docType (upper) → async fn({ docType, docId, status })
const _adapters = new Map();

/**
 * Register a document-status adapter for a given docType.
 * @param {string} docType  - e.g. "PO", "PR", "GRN"
 * @param {Function} handler - async fn({ docType, docId, status })
 */
function registerAdapter(docType, handler) {
    if (typeof handler !== "function") {
        throw new Error(`registerAdapter: handler for '${docType}' must be a function`);
    }
    _adapters.set(docType.toUpperCase(), handler);
    logger.info(`Approval adapter registered for docType: ${docType.toUpperCase()}`);
}

/**
 * Update the upstream document's status.
 * Falls through gracefully if no adapter is registered.
 *
 * @param {{ docType: string, docId: string, status: string }} params
 * @returns {Promise<{ success: boolean, mocked?: boolean }>}
 */
async function updateDocumentStatus({ docType, docId, status }) {
    const key = (docType || "").toUpperCase();
    const handler = _adapters.get(key);

    if (!handler) {
        // Not an error — adapter will be registered once the doc module exists
        logger.debug(`No adapter registered for docType '${key}' — status update mocked`, { docId, status });
        return { success: true, mocked: true };
    }

    try {
        await handler({ docType: key, docId, status });
        logger.info(`Document status updated via adapter: docType=${key} docId=${docId} status=${status}`);
        return { success: true };
    } catch (err) {
        // Adapter errors must NOT propagate and break the approval flow
        logger.error(`Adapter error for docType '${key}': ${err.message}`, { docId, status });
        return { success: false, error: err.message };
    }
}

/**
 * Optional: Retrieve document metadata (title, amount, etc.) for inbox display.
 * Returns null if no adapter is registered — callers guard for null.
 *
 * @param {{ docType: string, docId: string }} params
 * @returns {Promise<object|null>}
 */
async function getDocumentMeta({ docType, docId }) {
    const key = (docType || "").toUpperCase();
    const handler = _adapters.get(`${key}:meta`);
    if (!handler) return null;
    try {
        return await handler({ docType: key, docId });
    } catch (err) {
        logger.error(`Meta adapter error for '${key}': ${err.message}`);
        return null;
    }
}

module.exports = { registerAdapter, updateDocumentStatus, getDocumentMeta };
