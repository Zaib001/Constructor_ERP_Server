"use strict";

/**
 * zatca.worker.js — Asynchronous ZATCA Submission Queue Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone node-cron background worker. Polls the database-backed queue
 * for QUEUED or RETRYING submissions and processes them with exponential backoff.
 */

const cron = require("node-cron");
const prisma = require("../db");
const logger = require("../logger");
const { processSubmission } = require("../modules/finance/zatca/zatca.service");

let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; logger.info("[ZATCAWorker] SIGTERM received, shutting down gracefully..."); });
process.on("SIGINT", () => { shuttingDown = true; logger.info("[ZATCAWorker] SIGINT received, shutting down..."); process.exit(0); });

// Read interval from env, default to 2 minutes
const minutes = parseInt(process.env.ZATCA_WORKER_INTERVAL_MINUTES) || 2;
const schedule = `*/${minutes} * * * *`;

logger.info(`[ZATCAWorker] Starting queue worker — scheduled for every ${minutes} minutes (${schedule})`);

async function runQueueWorker() {
    if (shuttingDown) return;
    
    logger.info("[ZATCAWorker] Scanning for enqueued submissions...");
    try {
        // Pick up to 10 submissions that are QUEUED or RETRYING (and next_retry_at <= now)
        const pending = await prisma.zATCASubmission.findMany({
            where: {
                OR: [
                    { status: "QUEUED" },
                    {
                        status: "RETRYING",
                        next_retry_at: { lte: new Date() }
                    }
                ]
            },
            take: 10,
            orderBy: { created_at: "asc" }
        });

        if (pending.length === 0) {
            logger.info("[ZATCAWorker] No pending submissions found.");
            return;
        }

        logger.info(`[ZATCAWorker] Found ${pending.length} submissions to process.`);
        
        for (const sub of pending) {
            if (shuttingDown) break;
            logger.info(`[ZATCAWorker] Processing submission ${sub.id} (Invoice: ${sub.invoice_id})...`);
            try {
                await processSubmission(sub.id);
                logger.info(`[ZATCAWorker] Finished processing submission ${sub.id}`);
            } catch (err) {
                logger.error(`[ZATCAWorker] Failed processing submission ${sub.id}: ${err.message}`);
            }
        }
    } catch (err) {
        logger.error(`[ZATCAWorker] Database query failed: ${err.message}`);
    }
}

// Schedule the cron tick
cron.schedule(schedule, runQueueWorker, { scheduled: true, timezone: "UTC" });

// Run once immediately on worker startup
if (require.main === module) {
    (async () => {
        logger.info("[ZATCAWorker] Initial queue run on startup...");
        await runQueueWorker();
    })();
}

module.exports = { runQueueWorker };
