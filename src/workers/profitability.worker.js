"use strict";

/**
 * profitability.worker.js — Asynchronous Profitability Snapshots & Recalculation Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone background worker. Run with:
 *   node src/workers/profitability.worker.js
 *
 * Schedule:
 *   - Runs a full company profitability snapshot nightly at 2:00 AM.
 *   - Polls for and processes manual recalculation requests enqueued in RecalculationQueue.
 */

const cron = require("node-cron");
const prisma = require("../db");
const logger = require("../logger");
const { generateCompanySnapshots } = require("../modules/finance/profitability/profitability.service");

let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; logger.info("[ProfitabilityWorker] SIGTERM received, shutting down gracefully..."); });
process.on("SIGINT", () => { shuttingDown = true; logger.info("[ProfitabilityWorker] SIGINT received, shutting down..."); process.exit(0); });

logger.info("[ProfitabilityWorker] Starting worker - Nightly snapshot scheduled at 02:00 AM");

/**
 * Processes any manual enqueued Recalculation requests.
 */
async function processEnqueuedRecalculations() {
    if (shuttingDown) return;
    try {
        const pendingJobs = await prisma.recalculationQueue.findMany({
            where: {
                queue_type: "PROFITABILITY",
                status:     "PENDING"
            },
            orderBy: { created_at: "asc" }
        });

        if (pendingJobs.length === 0) return;

        logger.info(`[ProfitabilityWorker] Found ${pendingJobs.length} enqueued recalculation jobs.`);

        for (const job of pendingJobs) {
            if (shuttingDown) break;
            logger.info(`[ProfitabilityWorker] Processing recalculation job ${job.id} for company ${job.company_id} [Month: ${job.period_month}]...`);
            
            await prisma.recalculationQueue.update({
                where: { id: job.id },
                data: { status: "PROCESSING" }
            });

            try {
                await generateCompanySnapshots(job.company_id, job.period_month);
                await prisma.recalculationQueue.update({
                    where: { id: job.id },
                    data: {
                        status:       "DONE",
                        processed_at: new Date()
                    }
                });
                logger.info(`[ProfitabilityWorker] Recalculation job ${job.id} completed successfully.`);
            } catch (err) {
                logger.error(`[ProfitabilityWorker] Recalculation job ${job.id} failed: ${err.message}`);
                await prisma.recalculationQueue.update({
                    where: { id: job.id },
                    data: {
                        status: "FAILED",
                        error:  err.message
                    }
                });
            }
        }
    } catch (err) {
        logger.error(`[ProfitabilityWorker] Enqueued recalculation processing error: ${err.message}`);
    }
}

/**
 * Nightly recalculation of snapshots for all active companies.
 */
async function runNightlySnapshots() {
    if (shuttingDown) return;
    logger.info("[ProfitabilityWorker] Starting nightly snapshot job...");
    try {
        const companies = await prisma.company.findMany();
        const periodMonth = new Date().toISOString().slice(0, 7); // Current month YYYY-MM

        for (const company of companies) {
            if (shuttingDown) break;
            logger.info(`[ProfitabilityWorker] Computing nightly snapshots for company ${company.id}...`);
            try {
                await generateCompanySnapshots(company.id, periodMonth);
            } catch (err) {
                logger.error(`[ProfitabilityWorker] Failed computing snapshots for company ${company.id}: ${err.message}`);
            }
        }
        logger.info("[ProfitabilityWorker] Nightly snapshots completed.");
    } catch (err) {
        logger.error(`[ProfitabilityWorker] Nightly snapshot job error: ${err.message}`);
    }
}

// 1. Cron: Recalculation queue processing (runs every 5 minutes)
cron.schedule("*/5 * * * *", async () => {
    logger.info("[ProfitabilityWorker] Queue worker cron tick...");
    await processEnqueuedRecalculations();
}, { scheduled: true, timezone: "UTC" });

// 2. Cron: Nightly snapshot runs daily at 2:00 AM UTC
cron.schedule("0 2 * * *", async () => {
    await runNightlySnapshots();
}, { scheduled: true, timezone: "UTC" });

// Run once immediately on startup
if (require.main === module) {
    (async () => {
        logger.info("[ProfitabilityWorker] Initial startup scan...");
        await processEnqueuedRecalculations();
    })();
}

module.exports = { runNightlySnapshots, processEnqueuedRecalculations };
