"use strict";

const prisma = require("../../db");
const logger = require("../../logger");

/**
 * Write a record to audit.system_logs.
 * Never throws — failures are swallowed and logged to Winston only.
 *
 * @param {object} params
 * @param {string} params.level    - "info" | "warn" | "error" | "debug"
 * @param {string} params.message  - Human-readable message
 * @param {object} [params.context] - Any JSON-serialisable metadata (requestId, stack, etc.)
 */
async function logSystem({ level, message, context = {} }) {
    try {
        await prisma.systemLog.create({
            data: {
                level,
                message: String(message).substring(0, 2000), // guard against huge messages
                context: context || {},
                created_at: new Date(),
            },
        });
    } catch (err) {
        // DB write failed — fall back to Winston only. Never crash the app.
        logger.error("systemLogs: failed to write system log to DB", {
            originalLevel: level,
            originalMessage: message,
            dbError: err.message,
        });
    }
}

module.exports = { logSystem };
