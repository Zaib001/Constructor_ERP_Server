"use strict";

/**
 * vat.worker.js — Nightly VAT Reconciliation snapshot generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone node-cron worker that reconciles VAT transactions nightly at 3:00 AM.
 */

const cron = require("node-cron");
const prisma = require("../db");
const logger = require("../logger");
const { reconcilePeriodVAT } = require("../modules/finance/vat/vat.reconciliation");

let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; });
process.on("SIGINT", () => { shuttingDown = true; process.exit(0); });

logger.info("[VATWorker] Starting worker — Scheduled nightly VAT reconciliation at 03:00 AM");

async function runVATReconciliation() {
    if (shuttingDown) return;
    logger.info("[VATWorker] Running nightly VAT reconciliation snapshots...");

    try {
        const companies = await prisma.company.findMany();
        const activePeriods = await prisma.financialPeriod.findMany({
            where: { status: "open" }
        });

        for (const company of companies) {
            for (const period of activePeriods) {
                if (shuttingDown) break;
                if (period.company_id !== company.id) continue;

                logger.info(`[VATWorker] Reconciling VAT for company ${company.id} [Period: ${period.period_name}]...`);
                try {
                    await reconcilePeriodVAT(company.id, period.id, null);
                } catch (err) {
                    logger.error(`[VATWorker] VAT Reconciliation failed for company ${company.id}: ${err.message}`);
                }
            }
        }
    } catch (err) {
        logger.error(`[VATWorker] Nightly VAT reconciliation unhandled error: ${err.message}`);
    }
}

// Nightly cron: 3:00 AM UTC
cron.schedule("0 3 * * *", async () => {
    await runVATReconciliation();
}, { scheduled: true, timezone: "UTC" });

if (require.main === module) {
    (async () => {
        logger.info("[VATWorker] Initial startup run...");
        await runVATReconciliation();
    })();
}

module.exports = { runVATReconciliation };
