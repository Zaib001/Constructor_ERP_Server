"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");
const { processSubmission } = require("./zatca.service");

let isRunning = false;

/**
 * ZATCA Submission Queue Worker & Watchdog Watcher
 */
async function runZATCAWorker() {
    if (isRunning) return;
    isRunning = true;

    const workerName = "ZATCA_SUBMISSION_WORKER";
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    let retried = 0;
    let lastError = null;

    try {
        // 1. Worker Heartbeat and Uptime initialization
        await prisma.workerHealth.upsert({
            where: { worker_name: workerName },
            update: { heartbeat_at: new Date() },
            create: {
                worker_name: workerName,
                heartbeat_at: new Date(),
                status: "healthy"
            }
        });

        // 2. Watchdog Recovery: unlock jobs stuck in processing for > 10 minutes
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const stuckJobs = await prisma.zATCASubmission.findMany({
            where: {
                processing_lock_at: { lt: tenMinutesAgo },
                status: { notIn: ["ACCEPTED", "CLEARED"] }
            }
        });

        if (stuckJobs.length > 0) {
            logger.warn(`[ZATCA Worker] Watchdog found ${stuckJobs.length} stuck ZATCA submissions. Unlocking them.`);
            for (const job of stuckJobs) {
                await prisma.zATCASubmission.update({
                    where: { id: job.id },
                    data: {
                        processing_lock_at: null,
                        status: "QUEUED",
                        error_message: "Watchdog timeout: released stuck processing lock"
                    }
                });
            }
        }

        // 3. Process Pending Queue with Rate Limiting (max 15 submissions per interval)
        const pendingJobs = await prisma.zATCASubmission.findMany({
            where: {
                status: { in: ["QUEUED", "RETRYING"] },
                processing_lock_at: null,
                OR: [
                    { next_retry_at: null },
                    { next_retry_at: { lte: new Date() } }
                ]
            },
            take: 15,
            orderBy: { created_at: "asc" }
        });

        for (const job of pendingJobs) {
            try {
                // Rate Limiting: 500ms delay between gate submissions
                await new Promise(resolve => setTimeout(resolve, 500));
                
                await prisma.workerHealth.update({
                    where: { worker_name: workerName },
                    data: { current_processing_job: job.id, processing_started_at: new Date() }
                });

                const result = await processSubmission(job.id);
                if (result) {
                    if (result.status === "ACCEPTED" || result.status === "CLEARED") {
                        processed++;
                    } else if (result.status === "RETRYING") {
                        retried++;
                    } else {
                        failed++;
                    }
                }
            } catch (err) {
                failed++;
                lastError = err.message;
                logger.error(`[ZATCA Worker] Error processing submission ${job.id}:`, err);
            }
        }

        // 4. Update Health Record Stats
        const duration = Date.now() - startTime;
        const currentHealth = await prisma.workerHealth.findUnique({ where: { worker_name: workerName } });
        
        const totalDuration = Number(currentHealth?.total_duration_ms || 0) + duration;
        const totalProcessed = (currentHealth?.processed_count || 0) + processed;
        const totalFailed = (currentHealth?.failed_count || 0) + failed;
        const totalRetries = (currentHealth?.retry_count || 0) + retried;
        const runs = totalProcessed + totalFailed + totalRetries;
        const avgDuration = runs > 0 ? (totalDuration / runs).toFixed(2) : 0;

        await prisma.workerHealth.update({
            where: { worker_name: workerName },
            data: {
                last_run_at: new Date(),
                processed_count: totalProcessed,
                failed_count: totalFailed,
                retry_count: totalRetries,
                consecutive_failures: failed > 0 ? { increment: 1 } : 0,
                last_error_message: lastError || currentHealth?.last_error_message,
                last_success_at: processed > 0 ? new Date() : currentHealth?.last_success_at,
                last_failed_at: failed > 0 ? new Date() : currentHealth?.last_failed_at,
                current_processing_job: null,
                processing_started_at: null,
                average_duration_ms: avgDuration,
                total_duration_ms: totalDuration,
                status: failed > 0 ? "degraded" : "healthy"
            }
        });

    } catch (err) {
        logger.error("[ZATCA Worker] Critical execution failure:", err);
        try {
            await prisma.workerHealth.upsert({
                where: { worker_name: workerName },
                update: {
                    status: "failed",
                    last_error_message: err.message,
                    last_failed_at: new Date(),
                    consecutive_failures: { increment: 1 }
                },
                create: {
                    worker_name: workerName,
                    status: "failed",
                    last_error_message: err.message,
                    last_failed_at: new Date(),
                    consecutive_failures: 1
                }
            });
        } catch (e) {
            // Swallow DB upsert errors
        }
    } finally {
        isRunning = false;
    }
}

const { contextStorage } = require("../../../utils/context");
const crypto = require("crypto");

/**
 * Starts the polling intervals for ZATCA queue
 */
function startZATCAWorker(intervalMs = 30000) {
    logger.info(`[ZATCA Worker] Started polling worker interval (${intervalMs}ms)`);
    
    const runInContext = () => {
        const store = {
            correlationId: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            worker: "ZATCA_WORKER"
        };
        contextStorage.run(store, () => {
            runZATCAWorker().catch(err => logger.error("[ZATCA Worker] Run error:", err));
        });
    };

    // Run immediately, then poll
    runInContext();
    return setInterval(runInContext, intervalMs);
}

module.exports = {
    runZATCAWorker,
    startZATCAWorker
};
