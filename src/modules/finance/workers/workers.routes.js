"use strict";

const express = require("express");
const router = express.Router();
const prisma = require("../../../db");
const { generatePrometheusMetrics } = require("../../../utils/metrics");

/**
 * Worker Health Status Endpoint
 */
router.get("/health", async (req, res, next) => {
    try {
        const records = await prisma.workerHealth.findMany();
        res.json({
            status: "success",
            workers: records.map(r => ({
                worker_name: r.worker_name,
                status: r.status,
                heartbeat_at: r.heartbeat_at,
                last_run_at: r.last_run_at,
                processed_count: r.processed_count,
                failed_count: r.failed_count,
                retry_count: r.retry_count,
                consecutive_failures: r.consecutive_failures,
                last_error_message: r.last_error_message,
                average_duration_ms: Number(r.average_duration_ms || 0)
            }))
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Worker Prometheus Metrics Exporter Endpoint
 */
router.get("/metrics", async (req, res, next) => {
    try {
        const metrics = await generatePrometheusMetrics();
        res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        res.send(metrics);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
