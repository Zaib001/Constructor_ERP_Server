"use strict";

/**
 * profitability.service.js — Profitability Engine orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects database aggregations on LedgerEntries with the Profitability Calculator.
 * Supports cached snapshots for high-speed dashboards, live queries for drill-downs,
 * cost allocation rules, and an idempotent recalculation queue.
 */

const prisma = require("../../../db");
const { allocateOverhead, getLaborBurdenAllocation } = require("./allocation.engine");
const { computeProjectProfitability, computeDepartmentProfitability, computeCompanyProfitability } = require("./profitability.calculator");
const { round2 } = require("../vat/vat.engine");
const { computeProfitSnapshotHash, computeProjectProfitSnapshotHash, computeDeptProfitSnapshotHash, verifyCompanyProfitChain } = require("./profitability.checksum");
const crypto = require("crypto");

/**
 * Live Project Profitability calculation.
 * Used for deep-dives and on-demand audits.
 */
async function calculateProjectProfitLive(projectId, companyId, periodMonth) {
    const start = new Date(`${periodMonth}-01`);
    const end   = new Date(start.getFullYear(), start.getMonth() + 1, 0);

    const project = await prisma.project.findFirst({
        where: { id: projectId, company_id: companyId }
    });
    if (!project) throw new Error("Project not found.");

    // Query ledger entries tagged to this project
    const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: {
            company_id: companyId,
            project_id: projectId,
            posting_date: { gte: start, lte: end },
            account: {
                account_type: { in: ["Income", "Expense"] }
            }
        },
        include: { account: true }
    });

    let revenue = 0;
    let directCosts = 0;
    let materialCosts = 0;
    let subcontractorCosts = 0;

    ledgerEntries.forEach(entry => {
        const balance = Number(entry.debit) - Number(entry.credit);
        const code = entry.account.account_code;

        if (entry.account.account_type === "Income") {
            // Income credit balance represents sales revenue
            revenue += (Number(entry.credit) - Number(entry.debit));
        } else if (entry.account.account_type === "Expense") {
            if (code.startsWith("502")) {
                // e.g. 502 = Material Costs
                materialCosts += balance;
            } else if (code.startsWith("503")) {
                // e.g. 503 = Subcontractor Costs
                subcontractorCosts += balance;
            } else {
                directCosts += balance;
            }
        }
    });

    // Fetch labor burden costs
    const laborBurden = await getLaborBurdenAllocation(projectId, periodMonth);

    // Fetch allocated overhead
    const overheadAllocations = await allocateOverhead(companyId, periodMonth);
    const overhead = overheadAllocations.find(a => a.projectId === projectId)?.allocatedOverhead || 0;

    const metrics = computeProjectProfitability({
        contractValue: Number(project.contract_value || 0),
        revenue,
        directCosts,
        laborCosts: laborBurden.totalLaborCost,
        materialCosts,
        subcontractorCosts,
        overheadAllocation: overhead
    });

    return {
        project: { id: project.id, name: project.name, code: project.code },
        periodMonth,
        ...metrics
    };
}

/**
 * Live Department Profitability calculation.
 */
async function calculateDepartmentProfitLive(departmentId, companyId, periodMonth) {
    const start = new Date(`${periodMonth}-01`);
    const end   = new Date(start.getFullYear(), start.getMonth() + 1, 0);

    const dept = await prisma.department.findFirst({
        where: { id: departmentId, company_id: companyId },
        include: { cost_center: true }
    });
    if (!dept) throw new Error("Department not found.");

    let salaryCosts = 0;
    let expenseCosts = 0;
    let overheadCosts = 0;

    // Sum salary summaries
    const salaries = await prisma.departmentSalarySummary.findMany({
        where: {
            department_id: departmentId,
            period_month:  periodMonth,
            status:        "paid"
        }
    });
    salaryCosts = salaries.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

    // Sum other department cost center expenses from ledger
    if (dept.cost_center) {
        const ledgerEntries = await prisma.ledgerEntry.findMany({
            where: {
                company_id: companyId,
                cost_center_id: dept.cost_center.id,
                posting_date: { gte: start, lte: end },
                account: { account_type: "Expense" }
            }
        });
        
        ledgerEntries.forEach(e => {
            const val = Number(e.debit) - Number(e.credit);
            if (e.account_id === "OVERHEAD_MAP") {
                overheadCosts += val;
            } else {
                expenseCosts += val;
            }
        });
    }

    // Allocate department revenue dynamically based on timesheet hours of department employees relative to total company timesheet hours
    const allCompanyTimesheets = await prisma.timesheet.findMany({
        where: {
            company_id: companyId,
            check_in_at: { gte: start, lte: end },
            resource_type: "labor"
        },
        include: {
            employee: true
        }
    });

    const totalCompanyHours = allCompanyTimesheets.reduce((sum, ts) => sum + Number(ts.total_hours || 0), 0);

    let revenueAllocated = 0;
    if (totalCompanyHours > 0) {
        const deptTimesheets = allCompanyTimesheets.filter(ts => ts.employee && ts.employee.department_id === departmentId);
        const totalDeptHours = deptTimesheets.reduce((sum, ts) => sum + Number(ts.total_hours || 0), 0);

        const companySummary = await prisma.vATTransaction.aggregate({
            where: { company_id: companyId, direction: "OUTPUT", posting_date: { gte: start, lte: end } },
            _sum: { taxable_amount: true }
        });
        const totalCompanyRevenue = Number(companySummary._sum.taxable_amount || 0);

        const deptRatio = totalDeptHours / totalCompanyHours;
        revenueAllocated = round2(totalCompanyRevenue * deptRatio);
    }

    const metrics = computeDepartmentProfitability({
        revenueAllocated,
        salaryCosts,
        expenseCosts,
        overheadCosts
    });

    return {
        department: { id: dept.id, name: dept.name },
        periodMonth,
        ...metrics
    };
}

/**
 * Helper to get preceding month YYYY-MM
 */
function getPrecedingMonth(periodMonth) {
    const [year, month] = periodMonth.split("-").map(Number);
    if (month === 1) {
        return `${year - 1}-12`;
    } else {
        return `${year}-${String(month - 1).padStart(2, "0")}`;
    }
}

/**
 * Helper to sign a checksum using HMAC SHA-256
 */
function signChecksum(checksum) {
    const secret = process.env.JWT_SECRET || "erp_ledger_secret";
    return crypto.createHmac("sha256", secret).update(checksum).digest("hex");
}

/**
 * Generate cached monthly profit snapshots for the company.
 */
async function generateCompanySnapshots(companyId, periodMonth) {
    const start = new Date(`${periodMonth}-01`);
    const end   = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const precedingMonth = getPrecedingMonth(periodMonth);

    // 1. Calculate Company Overall
    const ledgerSummary = await prisma.ledgerEntry.findMany({
        where: {
            company_id: companyId,
            posting_date: { gte: start, lte: end },
            account: { account_type: { in: ["Income", "Expense"] } }
        },
        include: { account: true }
    });

    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalOPEX = 0;

    ledgerSummary.forEach(e => {
        const amount = Number(e.debit) - Number(e.credit);
        const code = e.account.account_code;

        if (e.account.account_type === "Income") {
            totalRevenue += (Number(e.credit) - Number(e.debit));
        } else if (e.account.account_type === "Expense") {
            if (code.startsWith("50")) {
                // e.g. 50 = COGS
                totalCOGS += amount;
            } else {
                totalOPEX += amount;
            }
        }
    });

    const companyMetrics = computeCompanyProfitability({
        totalRevenue,
        totalCOGS,
        totalOPEX
    });

    // Blockchain-style Chaining Lookup
    const precedingSnap = await prisma.profitSnapshot.findFirst({
        where: { company_id: companyId, period_month: precedingMonth }
    });
    const precedingChecksum = precedingSnap?.snapshot_checksum || "genesis";

    const snapData = {
        total_revenue:  companyMetrics.totalRevenue,
        total_cogs:     companyMetrics.totalCOGS,
        gross_profit:   companyMetrics.grossProfit,
        total_opex:     companyMetrics.totalOPEX,
        ebitda:         companyMetrics.ebitda,
        net_profit:     companyMetrics.netProfit,
        net_margin_pct: companyMetrics.netMarginPct,
        snapshot_version: "1.0.0"
    };

    const checksum = computeProfitSnapshotHash(companyId, periodMonth, snapData, precedingChecksum);
    const signature = signChecksum(checksum);

    // Write Company Snapshot
    await prisma.profitSnapshot.upsert({
        where: {
            company_id_period_month: { company_id: companyId, period_month: periodMonth }
        },
        update: {
            ...snapData,
            computed_by:           "worker",
            snapshot_checksum:     checksum,
            ledger_hash_signature: signature
        },
        create: {
            company_id:            companyId,
            period_month:          periodMonth,
            ...snapData,
            computed_by:           "worker",
            snapshot_checksum:     checksum,
            ledger_hash_signature: signature
        }
    });

    // 2. Snapshot All Active Projects
    const activeProjects = await prisma.project.findMany({
        where: { company_id: companyId, status: "Active" }
    });

    for (const proj of activeProjects) {
        try {
            const pm = await calculateProjectProfitLive(proj.id, companyId, periodMonth);

            const precedingProjSnap = await prisma.projectProfitSnapshot.findFirst({
                where: { company_id: companyId, project_id: proj.id, period_month: precedingMonth }
            });
            const precedingProjChecksum = precedingProjSnap?.snapshot_checksum || "genesis";
            
            const projData = {
                revenue:              pm.revenue,
                direct_costs:         pm.directCosts,
                labor_costs:          pm.laborCosts,
                material_costs:       pm.materialCosts,
                subcontractor_costs:  pm.subcontractorCosts,
                overhead_allocation:  pm.overheadAllocation,
                gross_profit:         pm.grossProfit,
                net_profit:           pm.netProfit,
                profit_margin_pct:    pm.profitMarginPct,
                projected_revenue:    pm.projectedRevenue,
                projected_profit:     pm.projectedProfit,
                snapshot_version:     "1.0.0"
            };

            const projChecksum = computeProjectProfitSnapshotHash(companyId, proj.id, periodMonth, projData, precedingProjChecksum);
            const projSignature = signChecksum(projChecksum);

            await prisma.projectProfitSnapshot.upsert({
                where: {
                    company_id_project_id_period_month: {
                        company_id: companyId,
                        project_id: proj.id,
                        period_month: periodMonth
                    }
                },
                update: {
                    ...projData,
                    snapshot_checksum:     projChecksum,
                    ledger_hash_signature: projSignature
                },
                create: {
                    company_id:            companyId,
                    project_id:            proj.id,
                    period_month:          periodMonth,
                    ...projData,
                    snapshot_checksum:     projChecksum,
                    ledger_hash_signature: projSignature
                }
            });
        } catch (err) {
            // Log project-specific failure but continue other snapshots
            logger.warn(`Failed to snapshot project profitability: ${proj.id}`, { err: err.message });
        }
    }

    // 3. Snapshot All Departments
    const activeDepts = await prisma.department.findMany({
        where: { company_id: companyId }
    });

    for (const d of activeDepts) {
        try {
            const dm = await calculateDepartmentProfitLive(d.id, companyId, periodMonth);

            const precedingDeptSnap = await prisma.departmentProfitSnapshot.findFirst({
                where: { company_id: companyId, department_id: d.id, period_month: precedingMonth }
            });
            const precedingDeptChecksum = precedingDeptSnap?.snapshot_checksum || "genesis";

            const deptData = {
                revenue_allocated:  dm.revenueAllocated,
                salary_costs:       dm.salaryCosts,
                expense_costs:      dm.expenseCosts,
                overhead_costs:     dm.overheadCosts,
                net_profit:         dm.netProfit,
                margin_pct:         dm.marginPct,
                snapshot_version:   "1.0.0"
            };

            const deptChecksum = computeDeptProfitSnapshotHash(companyId, d.id, periodMonth, deptData, precedingDeptChecksum);
            const deptSignature = signChecksum(deptChecksum);

            await prisma.departmentProfitSnapshot.upsert({
                where: {
                    company_id_department_id_period_month: {
                        company_id: companyId,
                        department_id: d.id,
                        period_month: periodMonth
                    }
                },
                update: {
                    ...deptData,
                    snapshot_checksum:     deptChecksum,
                    ledger_hash_signature: deptSignature
                },
                create: {
                    company_id:            companyId,
                    department_id:         d.id,
                    period_month:          periodMonth,
                    ...deptData,
                    snapshot_checksum:     deptChecksum,
                    ledger_hash_signature: deptSignature
                }
            });
        } catch (err) {
            logger.warn(`Failed to snapshot department profitability: ${d.id}`, { err: err.message });
        }
    }
}

/**
 * Fetch monthly Profit Snapshots (Dashboard high-performance cache)
 */
async function getProfitDashboardCache(companyId, periodMonth) {
    const company = await prisma.profitSnapshot.findUnique({
        where: { company_id_period_month: { company_id: companyId, period_month: periodMonth } }
    });

    const projects = await prisma.projectProfitSnapshot.findMany({
        where: { company_id: companyId, period_month: periodMonth },
        include: {
            project: { select: { name: true, code: true } }
        },
        orderBy: { net_profit: "desc" }
    });

    const departments = await prisma.departmentProfitSnapshot.findMany({
        where: { company_id: companyId, period_month: periodMonth },
        include: {
            department: { select: { name: true } }
        },
        orderBy: { net_profit: "desc" }
    });

    // Run cryptographic verification of the snapshot blockchain-style chain
    let verification = { valid: true, error: null };
    try {
        verification = await verifyCompanyProfitChain(companyId);
    } catch (err) {
        verification = { valid: false, error: err.message };
    }

    return { company, projects, departments, verification };
}

/**
 * Enqueue a manual recalculation job to RecalculationQueue.
 */
async function enqueueRecalculation(companyId, periodMonth, triggeredBy) {
    const job = await prisma.recalculationQueue.create({
        data: {
            company_id:   companyId,
            queue_type:   "PROFITABILITY",
            period_month: periodMonth,
            status:       "PENDING",
            triggered_by: triggeredBy
        }
    });

    // Run background worker asynchronously
    require("./profitability.worker").runProfitabilityWorker().catch(err => {
        logger.error(`[Recalculation Queue] Worker execution failed: ${err.message}`);
    });

    return job;
}

module.exports = {
    calculateProjectProfitLive,
    calculateDepartmentProfitLive,
    generateCompanySnapshots,
    getProfitDashboardCache,
    enqueueRecalculation
};
