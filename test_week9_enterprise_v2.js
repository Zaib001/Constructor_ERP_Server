"use strict";

require("dotenv").config();
const assert = require("assert");
const crypto = require("crypto");
const prisma = require("./src/db");

// Load modules
const { computeVAT, computeMultiLine, validateVATIntegrity } = require("./src/modules/finance/vat/vat.engine");
const { generateZATCAQR } = require("./src/modules/finance/zatca/zatca.qr");
const { encrypt, decrypt } = require("./src/modules/finance/zatca/zatca.utils");
const { processSubmission } = require("./src/modules/finance/zatca/zatca.service");
const { runProfitabilityWorker } = require("./src/modules/finance/profitability/profitability.worker");
const { verifyCompanyProfitChain } = require("./src/modules/finance/profitability/profitability.checksum");

/**
 * Enterprise automated integration testing suite.
 * Validates concurrency locks, queue idempotency, health monitor registers,
 * and blockchain-style cryptographic verification chains.
 */
async function runTests() {
    console.log("\x1b[36m%s\x1b[0m", "=========================================================");
    console.log("\x1b[36m%s\x1b[0m", "   RUNNING WEEK 9 ADVANCED ENTERPRISE VERIFICATION SUITE");
    console.log("\x1b[36m%s\x1b[0m", "=========================================================");

    // Dynamically find a company that has at least one project
    const project = await prisma.project.findFirst();
    if (!project) {
        throw new Error("No projects found in the database. Please seed the database first.");
    }
    const companyId = project.company_id;
    console.log(`  Resolved Active Company ID: ${companyId} (Project: ${project.name})`);

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 1: DETERMINISTIC VAT ENGINE CALCULATIONS
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n\x1b[33m%s\x1b[0m", "[SCENARIO 1] Deterministic VAT Engine Calculations");
    const res1 = computeVAT({ amount: 100, rate: 15, type: "STANDARD", inclusive: false });
    assert.strictEqual(res1.taxableAmount, 100.00);
    assert.strictEqual(res1.vatAmount, 15.00);
    assert.strictEqual(res1.grossAmount, 115.00);
    console.log("  ✔ Standard Exclusive calculation passed.");

    const res2 = computeVAT({ amount: 115, rate: 15, type: "STANDARD", inclusive: true });
    assert.strictEqual(res2.taxableAmount, 100.00);
    assert.strictEqual(res2.vatAmount, 15.00);
    assert.strictEqual(res2.grossAmount, 115.00);
    console.log("  ✔ Standard Inclusive calculation passed.");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: ZATCA QUEUE IDEMPOTENCY & PROCESSING LOCK
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n\x1b[33m%s\x1b[0m", "[SCENARIO 2] ZATCA Queue Idempotency & Concurrency Lock");

    // Let's find a user belonging to this company to act as creator
    const user = await prisma.user.findFirst({
        where: { company_id: companyId }
    });
    if (!user) {
        throw new Error("No user found for company to bind test invoice.");
    }

    // Let's create a test invoice
    const testInvoice = await prisma.clientInvoice.create({
        data: {
            company: { connect: { id: companyId } },
            project: { connect: { id: project.id } },
            creator: { connect: { id: user.id } },
            invoice_no: `INV-TST-${Date.now()}`,
            invoice_date: new Date(),
            due_date: new Date(),
            document_status: "draft",
            subtotal: 1000.00,
            vat_amount: 150.00,
            net_payable: 1150.00
        }
    });

    // Create a ZATCA Queue item
    // Create a ZATCA Queue item
    const queueItem = await prisma.zATCASubmission.create({
        data: {
            company_id: companyId,
            invoice_id: testInvoice.id,
            zatca_uuid: crypto.randomUUID(),
            status: "QUEUED",
            retry_count: 0
        }
    });

    // Simulate concurrent workers trying to process the exact same queue job
    console.log("  Triggering dual concurrent claims for job ID:", queueItem.id);
    const results = await Promise.all([
        processSubmission(queueItem.id),
        processSubmission(queueItem.id)
    ]);

    // One should return a processed submission object, other should return null (already processing/locked)
    const successCount = results.filter(r => r !== null).length;
    console.log(`  Concurrent process results: [${results.map(r => r ? r.status : "null").join(", ")}]`);
    assert.strictEqual(successCount, 1, "Only exactly one worker process must claim and execute the queue item!");
    console.log("  ✔ Queue idempotency processing lock verified.");

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 3: CRYPTOGRAPHIC BLOCKCHAIN CHAIN INTEGRITY CHECK
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n\x1b[33m%s\x1b[0m", "[SCENARIO 3] Profitability Snapshot Verification");

    // Queue profitability recalculation
    const recalcJob = await prisma.recalculationQueue.create({
        data: {
            company_id: companyId,
            queue_type: "PROFITABILITY",
            period_month: "2026-05",
            status: "PENDING",
            triggered_by: "test"
        }
    });

    // Run profitability worker to calculate snapshots
    console.log("  Running profitability background worker to generate snapshots...");
    await runProfitabilityWorker();

    // Verify company profit chain
    console.log("  Verifying cryptographic chain integrity...");
    const chainStatus = await verifyCompanyProfitChain(companyId);
    assert.strictEqual(chainStatus.valid, true, "Calculated chain must be valid!");
    console.log("  ✔ Cryptographic chain verification passed.");

    // Let's simulate database tampering (altering ebitda)
    console.log("  Simulating database tampering to test detection...");
    const snap = await prisma.profitSnapshot.findFirst({
        where: { company_id: companyId, period_month: "2026-05" }
    });
    if (snap) {
        await prisma.profitSnapshot.update({
            where: { id: snap.id },
            data: { ebitda: 999999.00 } // Tampered value
        });

        const tamperedChain = await verifyCompanyProfitChain(companyId);
        assert.strictEqual(tamperedChain.valid, false, "Chain check must catch the database tampering!");
        console.log("  ✔ Tampering check successfully intercepted the mutation!");

        // Restore snapshot back
        await prisma.profitSnapshot.update({
            where: { id: snap.id },
            data: { ebitda: snap.ebitda }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 4: METRICS & OBSERVABILITY
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n\x1b[33m%s\x1b[0m", "[SCENARIO 4] Worker Health & Observability Metrics");
    const healthRecords = await prisma.workerHealth.findMany();
    assert.ok(healthRecords.length > 0, "At least one worker health record must be initialized");
    console.log(`  Found ${healthRecords.length} worker health records:`);
    for (const h of healthRecords) {
        console.log(`    - Worker: ${h.worker_name}, Status: ${h.status}, Processed: ${h.processed_count}`);
        assert.strictEqual(h.status, "healthy", `Worker ${h.worker_name} should be reported as healthy`);
    }
    console.log("  ✔ Worker health monitoring records successfully verified.");

    // Cleanup test data
    console.log("\n  Cleaning up test entities...");
    await prisma.zATCAEventLog.deleteMany({ where: { submission_id: queueItem.id } });
    await prisma.zATCASubmission.deleteMany({ where: { invoice_id: testInvoice.id } });
    await prisma.clientInvoice.delete({ where: { id: testInvoice.id } });
    await prisma.recalculationQueue.delete({ where: { id: recalcJob.id } });

    console.log("\n\x1b[32m%s\x1b[0m", "=========================================================");
    console.log("\x1b[32m%s\x1b[0m", "        ALL ENTERPRISE VERIFICATIONS PASSED (4/4)        ");
    console.log("\x1b[32m%s\x1b[0m", "=========================================================");
}

runTests().catch(err => {
    console.error("\x1b[31m%s\x1b[0m", `\n✖ Verification failed: ${err.message}`);
    console.error(err);
    process.exit(1);
});
