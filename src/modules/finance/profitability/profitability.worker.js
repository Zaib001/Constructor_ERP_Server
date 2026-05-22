"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");
const { generateCompanySnapshots } = require("./profitability.service");

let isRunning = false;

/**
 * Profitability Recalculation Queue Worker & Telemetry Monitor
 */
async function runProfitabilityWorker() {
    if (isRunning) return;
    isRunning = true;

    const workerName = "PROFITABILITY_WORKER";
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
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

        // 2. Watchdog Recovery: unlock jobs stuck in PROCESSING for > 15 minutes
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const stuckJobs = await prisma.recalculationQueue.findMany({
            where: {
                status: "PROCESSING",
                queue_type: "PROFITABILITY",
                created_at: { lt: fifteenMinutesAgo }
            }
        });

        if (stuckJobs.length > 0) {
            logger.warn(`[Profitability Worker] Watchdog found ${stuckJobs.length} stuck recalculation jobs. Re-queueing.`);
            for (const job of stuckJobs) {
                await prisma.recalculationQueue.update({
                    where: { id: job.id },
                    data: {
                        status: "PENDING",
                        error: "Watchdog timeout: released stuck processing lock"
                    }
                });
            }
        }

        // 3. Fetch Pending Queue jobs
        const pendingJobs = await prisma.recalculationQueue.findMany({
            where: {
                status: "PENDING",
                queue_type: "PROFITABILITY"
            },
            orderBy: { created_at: "asc" },
            take: 5
        });

        for (const job of pendingJobs) {
            // Atomic Concurrency-Safe Claiming Lock
            const affected = await prisma.recalculationQueue.updateMany({
                where: {
                    id: job.id,
                    status: "PENDING"
                },
                data: {
                    status: "PROCESSING"
                }
            });

            if (affected.count === 0) {
                // Job already claimed by another worker instance
                continue;
            }

            const claimedJob = await prisma.recalculationQueue.findUnique({ where: { id: job.id } });

            try {
                logger.info(`[Profitability Worker] Claimed job ${claimedJob.id} for company ${claimedJob.company_id}, period ${claimedJob.period_month}`);
                
                await prisma.workerHealth.update({
                    where: { worker_name: workerName },
                    data: { current_processing_job: claimedJob.id, processing_started_at: new Date() }
                });

                // Generate Company, Projects, and Departments Snapshots dynamically
                await generateCompanySnapshots(claimedJob.company_id, claimedJob.period_month);

                await prisma.recalculationQueue.update({
                    where: { id: claimedJob.id },
                    data: {
                        status: "DONE",
                        processed_at: new Date()
                    }
                });

                processed++;
                logger.info(`[Profitability Worker] Successfully finished job ${claimedJob.id}`);
            } catch (err) {
                failed++;
                lastError = err.message;
                logger.error(`[Profitability Worker] Failed job ${claimedJob.id}: ${err.message}`, { err });
                
                await prisma.recalculationQueue.update({
                    where: { id: claimedJob.id },
                    data: {
                        status: "FAILED",
                        error: err.message
                    }
                });
            }
        }

        // 4. Update Health Record Stats
        const duration = Date.now() - startTime;
        const currentHealth = await prisma.workerHealth.findUnique({ where: { worker_name: workerName } });
        
        const totalDuration = Number(currentHealth?.total_duration_ms || 0) + duration;
        const totalProcessed = (currentHealth?.processed_count || 0) + processed;
        const totalFailed = (currentHealth?.failed_count || 0) + failed;
        const runs = totalProcessed + totalFailed;
        const avgDuration = runs > 0 ? (totalDuration / runs).toFixed(2) : 0;

        await prisma.workerHealth.update({
            where: { worker_name: workerName },
            data: {
                last_run_at: new Date(),
                processed_count: totalProcessed,
                failed_count: totalFailed,
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
        logger.error("[Profitability Worker] Critical execution failure:", err);
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
            // Ignore DB error
        }
    } finally {
        isRunning = false;
    }
}

const { contextStorage } = require("../../../utils/context");
const crypto = require("crypto");

/**
 * Starts the polling intervals for Profitability Recalculation queue
 */
function startProfitabilityWorker(intervalMs = 30000) {
    logger.info(`[Profitability Worker] Started polling worker interval (${intervalMs}ms)`);
    
    const runInContext = () => {
        const store = {
            correlationId: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            worker: "PROFITABILITY_WORKER"
        };
        contextStorage.run(store, () => {
            runProfitabilityWorker().catch(err => logger.error("[Profitability Worker] Run error:", err));
        });
    };

    runInContext();
    return setInterval(runInContext, intervalMs);
}

module.exports = {
    runProfitabilityWorker,
    startProfitabilityWorker
};
