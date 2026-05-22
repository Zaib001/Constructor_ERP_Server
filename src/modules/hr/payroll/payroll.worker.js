"use strict";

const crypto = require("crypto");
const prisma = require("../../../db");
const logger = require("../../../logger");
const { draftPayrollRun, approveAndLockPayroll } = require("./payroll.workflow");
const { allocateLaborCosts, triggerProfitabilitySync } = require("./allocation.service");
const { postPayrollToLedger } = require("./payroll.posting");

/**
 * Hash string key to two signed 32-bit integers for PostgreSQL pg_advisory_xact_lock(key1, key2)
 */
function getAdvisoryLockKey(keyStr) {
    const hash = crypto.createHash("sha256").update(keyStr).digest();
    const key1 = hash.readInt32BE(0);
    const key2 = hash.readInt32BE(4);
    return { key1, key2 };
}

/**
 * Worker: Process a new Draft Run with advisory locking
 */
async function workerProcessDraftRun(companyId, periodMonth, creatorId) {
    const lockKey = `DRAFT-${companyId}-${periodMonth}`;
    const { key1, key2 } = getAdvisoryLockKey(lockKey);
    
    return prisma.$transaction(async (tx) => {
        logger.info(`[PAYROLL_WORKER] Acquiring advisory lock for draft run: ${lockKey}`);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key1}, ${key2})`;
        
        logger.info(`[PAYROLL_WORKER] Processing Draft Run for ${periodMonth}`);
        return await draftPayrollRun(companyId, periodMonth, creatorId, tx);
    }, { maxWait: 20000, timeout: 60000 });
}

/**
 * Worker: Process Payroll Approval and Subsequent Posting and Allocations inside a single transaction
 */
async function workerProcessApproval(runId, approverId) {
    const lockKey = `APPROVAL-${runId}`;
    const { key1, key2 } = getAdvisoryLockKey(lockKey);

    return prisma.$transaction(async (tx) => {
        logger.info(`[PAYROLL_WORKER] Acquiring advisory lock for approval run: ${lockKey}`);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key1}, ${key2})`;

        logger.info(`[PAYROLL_WORKER] Approving and Locking Payroll ${runId}`);
        const lockedRun = await approveAndLockPayroll(runId, approverId, tx);

        logger.info(`[PAYROLL_WORKER] Allocating Labor Costs for ${runId}`);
        await allocateLaborCosts(runId, tx);

        logger.info(`[PAYROLL_WORKER] Triggering Profitability Sync for ${runId}`);
        await triggerProfitabilitySync(lockedRun.company_id, runId, tx);

        logger.info(`[PAYROLL_WORKER] Posting Payroll to Ledger for ${runId}`);
        const postedRun = await postPayrollToLedger(runId, approverId, tx);

        logger.info(`[PAYROLL_WORKER] Payroll ${runId} fully processed and integrated.`);
        return postedRun;
    }, { maxWait: 30000, timeout: 90000 });
}

module.exports = {
    workerProcessDraftRun,
    workerProcessApproval,
    getAdvisoryLockKey
};

