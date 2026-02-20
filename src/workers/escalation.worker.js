"use strict";

/**
 * Escalation Worker — escalation.worker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone process. Run with:
 *   node src/workers/escalation.worker.js
 *
 * Or import from another module for on-demand triggering.
 *
 * Schedule: Every 5 minutes via node-cron.
 */

const cron = require("node-cron");
const logger = require("../logger");
const { runEscalation } = require("../services/escalation.service");

// Graceful shutdown
let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; logger.info("[EscalationWorker] SIGTERM received, shutting down..."); });
process.on("SIGINT", () => { shuttingDown = true; logger.info("[EscalationWorker] SIGINT received, shutting down..."); process.exit(0); });

logger.info("[EscalationWorker] Starting — will run every 5 minutes");

// Schedule: every 5 minutes
cron.schedule("*/5 * * * *", async () => {
    if (shuttingDown) return;
    logger.info("[EscalationWorker] Cron tick...");
    try {
        const result = await runEscalation();
        logger.info(`[EscalationWorker] Tick complete — escalated=${result.escalatedCount} errors=${result.errorCount}`);
    } catch (err) {
        logger.error(`[EscalationWorker] Unhandled error in cron tick: ${err.message}`);
    }
}, { scheduled: true, timezone: "UTC" });

// When run as a standalone process, also run once on startup
if (require.main === module) {
    (async () => {
        logger.info("[EscalationWorker] Running initial escalation check on startup...");
        try {
            const result = await runEscalation();
            logger.info(`[EscalationWorker] Initial run complete — escalated=${result.escalatedCount}`);
        } catch (err) {
            logger.error(`[EscalationWorker] Initial run failed: ${err.message}`);
        }
    })();
}

module.exports = { runEscalation };
