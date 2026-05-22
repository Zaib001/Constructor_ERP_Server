"use strict";

const prisma = require("../db");

/**
 * Generates Prometheus format metrics from database WorkerHealth records
 */
async function generatePrometheusMetrics() {
    const healthRecords = await prisma.workerHealth.findMany();
    
    let output = "";
    
    output += "# HELP worker_uptime_seconds Time since last worker heartbeat in seconds\n";
    output += "# TYPE worker_uptime_seconds gauge\n";
    
    output += "# HELP worker_processed_total Total number of jobs processed by worker\n";
    output += "# TYPE worker_processed_total counter\n";
    
    output += "# HELP worker_failed_total Total number of failed jobs by worker\n";
    output += "# TYPE worker_failed_total counter\n";
    
    output += "# HELP worker_retry_total Total number of job retries by worker\n";
    output += "# TYPE worker_retry_total counter\n";
    
    output += "# HELP worker_average_duration_ms Average execution duration in milliseconds\n";
    output += "# TYPE worker_average_duration_ms gauge\n";

    for (const record of healthRecords) {
        const name = record.worker_name;
        const processed = record.processed_count || 0;
        const failed = record.failed_count || 0;
        const retries = record.retry_count || 0;
        const avgDuration = record.average_duration_ms ? Number(record.average_duration_ms) : 0;
        
        let uptime = 0;
        if (record.heartbeat_at && record.last_run_at) {
            uptime = Math.max(0, Math.floor((record.heartbeat_at.getTime() - record.last_run_at.getTime()) / 1000));
        }

        output += `worker_uptime_seconds{worker="${name}"} ${uptime}\n`;
        output += `worker_processed_total{worker="${name}"} ${processed}\n`;
        output += `worker_failed_total{worker="${name}"} ${failed}\n`;
        output += `worker_retry_total{worker="${name}"} ${retries}\n`;
        output += `worker_average_duration_ms{worker="${name}"} ${avgDuration}\n`;
    }
    
    return output;
}

module.exports = {
    generatePrometheusMetrics
};
