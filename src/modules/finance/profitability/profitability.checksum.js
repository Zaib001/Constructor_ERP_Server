"use strict";

const crypto = require("crypto");
const prisma = require("../../../db");

/**
 * Calculates SHA-256 checksum for a Company ProfitSnapshot.
 */
function computeProfitSnapshotHash(companyId, periodMonth, data, precedingChecksum = "genesis") {
    const payload = [
        String(companyId),
        String(periodMonth),
        String(Number(data.total_revenue || 0).toFixed(2)),
        String(Number(data.total_cogs || 0).toFixed(2)),
        String(Number(data.gross_profit || 0).toFixed(2)),
        String(Number(data.total_opex || 0).toFixed(2)),
        String(Number(data.ebitda || 0).toFixed(2)),
        String(Number(data.net_profit || 0).toFixed(2)),
        String(Number(data.net_margin_pct || 0).toFixed(2)),
        String(data.snapshot_version || "1.0.0"),
        String(precedingChecksum)
    ].join("|");

    return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Calculates SHA-256 checksum for a ProjectProfitSnapshot.
 */
function computeProjectProfitSnapshotHash(companyId, projectId, periodMonth, data, precedingChecksum = "genesis") {
    const payload = [
        String(companyId),
        String(projectId),
        String(periodMonth),
        String(Number(data.revenue || 0).toFixed(2)),
        String(Number(data.direct_costs || 0).toFixed(2)),
        String(Number(data.labor_costs || 0).toFixed(2)),
        String(Number(data.material_costs || 0).toFixed(2)),
        String(Number(data.subcontractor_costs || 0).toFixed(2)),
        String(Number(data.overhead_allocation || 0).toFixed(2)),
        String(Number(data.gross_profit || 0).toFixed(2)),
        String(Number(data.net_profit || 0).toFixed(2)),
        String(Number(data.profit_margin_pct || 0).toFixed(2)),
        String(data.snapshot_version || "1.0.0"),
        String(precedingChecksum)
    ].join("|");

    return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Calculates SHA-256 checksum for a DepartmentProfitSnapshot.
 */
function computeDeptProfitSnapshotHash(companyId, departmentId, periodMonth, data, precedingChecksum = "genesis") {
    const payload = [
        String(companyId),
        String(departmentId),
        String(periodMonth),
        String(Number(data.revenue_allocated || 0).toFixed(2)),
        String(Number(data.salary_costs || 0).toFixed(2)),
        String(Number(data.expense_costs || 0).toFixed(2)),
        String(Number(data.overhead_costs || 0).toFixed(2)),
        String(Number(data.net_profit || 0).toFixed(2)),
        String(Number(data.margin_pct || 0).toFixed(2)),
        String(data.snapshot_version || "1.0.0"),
        String(precedingChecksum)
    ].join("|");

    return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Verifies the entire blockchain-style ledger chain for a company's ProfitSnapshots.
 */
async function verifyCompanyProfitChain(companyId) {
    const snapshots = await prisma.profitSnapshot.findMany({
        where: { company_id: companyId },
        orderBy: { period_month: "asc" }
    });

    let currentPreceding = "genesis";
    const report = [];
    let chainValid = true;

    for (const snap of snapshots) {
        const expected = computeProfitSnapshotHash(companyId, snap.period_month, snap, currentPreceding);
        const actual = snap.snapshot_checksum;
        const matches = (expected === actual);

        if (!matches) {
            chainValid = false;
        }

        report.push({
            period_month: snap.period_month,
            expected_checksum: expected,
            actual_checksum: actual,
            valid: matches
        });

        // Set current checksum as preceding for the next month in chain
        currentPreceding = actual || expected;
    }

    return { valid: chainValid, snapshots: report };
}

module.exports = {
    computeProfitSnapshotHash,
    computeProjectProfitSnapshotHash,
    computeDeptProfitSnapshotHash,
    verifyCompanyProfitChain
};
