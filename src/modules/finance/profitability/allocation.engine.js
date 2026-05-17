"use strict";

/**
 * allocation.engine.js — Cost Allocation Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements enterprise allocation logic for shared costs, overhead, labor burden,
 * and equipment allocation to ensure accurate project-level and department-level P&L.
 */

const prisma = require("../../../db");
const { round2 } = require("../vat/vat.engine");

/**
 * Allocate indirect overhead costs from department cost centers to active projects.
 * Allocation rules:
 *   - Pro-rata based on project contract value or project revenue ratio.
 * @param {string} companyId
 * @param {string} periodMonth - e.g. "2026-05"
 * @returns {Promise<Array<{ projectId, allocatedOverhead }>>}
 */
async function allocateOverhead(companyId, periodMonth) {
    // 1. Fetch total indirect costs for the period month from LedgerEntry
    // Typically, overhead accounts are mapped to expense types in COA and lack a direct project_id tag.
    const start = new Date(`${periodMonth}-01`);
    const end   = new Date(start.getFullYear(), start.getMonth() + 1, 0); // End of month

    const overheadEntries = await prisma.ledgerEntry.findMany({
        where: {
            company_id: companyId,
            posting_date: { gte: start, lte: end },
            project_id: null, // Indirect costs are not tagged to a specific project
            account: {
                account_type: "Expense",
                account_code: { startsWith: "5" } // e.g. Admin, Office Rent, Shared Staff
            }
        }
    });

    const totalOverhead = overheadEntries.reduce((sum, e) => {
        return sum + (Number(e.debit) - Number(e.credit));
    }, 0);

    if (totalOverhead <= 0) return [];

    // 2. Fetch active projects with contract values or revenue in this period
    const projects = await prisma.project.findMany({
        where: { company_id: companyId, status: "Active" }
    });

    if (projects.length === 0) return [];

    // Simple Rule: Pro-rata allocation based on contract value ratio
    const totalContractValue = projects.reduce((sum, p) => sum + Number(p.contract_value || 0), 0) || 1;

    const allocations = projects.map(proj => {
        const ratio = Number(proj.contract_value || 0) / totalContractValue;
        const allocatedOverhead = round2(totalOverhead * ratio);
        return {
            projectId: proj.id,
            allocatedOverhead
        };
    });

    return allocations;
}

/**
 * Calculate the labor burden multiplier for employees (base salary + benefits / payroll taxes).
 * In construction ERP, base timesheet hours are marked as raw direct costs, while burden includes
 * healthcare, worker compensation insurance, housing allocations, and vehicle allocations.
 */
async function getLaborBurdenAllocation(projectId, periodMonth) {
    const start = new Date(`${periodMonth}-01`);
    const end   = new Date(start.getFullYear(), start.getMonth() + 1, 0);

    // Sum base payroll salaries enqueued to this project's cost center
    const payrollEntries = await prisma.ledgerEntry.findMany({
        where: {
            project_id: projectId,
            posting_date: { gte: start, lte: end },
            account: {
                account_code: { startsWith: "501" } // e.g. Direct Labor / Salaries
            }
        }
    });

    const directLaborCost = payrollEntries.reduce((sum, e) => sum + (Number(e.debit) - Number(e.credit)), 0);
    
    // Labor burden markup is historically estimated at 22% of direct labor in GCC construction (housing, iqama, insurance)
    const laborBurdenMarkup = round2(directLaborCost * 0.22);
    
    return {
        directLaborCost: round2(directLaborCost),
        laborBurden:     laborBurdenMarkup,
        totalLaborCost:  round2(directLaborCost + laborBurdenMarkup)
    };
}

module.exports = { allocateOverhead, getLaborBurdenAllocation };
