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

    // 1. Fetch timesheets for the project in this period
    const timesheets = await prisma.timesheet.findMany({
        where: {
            project_id: projectId,
            check_in_at: { gte: start, lte: end },
            resource_type: "labor"
        },
        include: {
            employee: true
        }
    });

    if (timesheets.length === 0) {
        logger.warn(`[Profitability Engine] No timesheets found for project ${projectId} in ${periodMonth}. Assuming zero direct labor cost.`);
        return {
            directLaborCost: 0,
            laborBurden: 0,
            totalLaborCost: 0
        };
    }

    let directLaborCost = 0;

    for (const ts of timesheets) {
        if (!ts.employee) {
            throw new Error(`Cost Allocation Rejected: Timesheet record ${ts.id} is missing employee assignment.`);
        }

        const emp = ts.employee;
        const basic = Number(emp.basic_salary || emp.salary || 0);
        const allowances = Number(emp.housing_allowance || 0) +
                           Number(emp.transportation_allowance || 0) +
                           Number(emp.other_allowance || 0);

        const grossMonthly = basic + allowances;
        if (grossMonthly <= 0) {
            throw new Error(`Cost Allocation Rejected: Wage rates are missing/zero for employee ${emp.name || emp.id}.`);
        }

        const contractHours = emp.contract_hours || 200;
        const hourlyRate = grossMonthly / contractHours;
        const hours = Number(ts.total_hours || 0);

        directLaborCost += hours * hourlyRate;
    }

    // Labor burden markup is historically estimated at 22% of direct labor in GCC construction
    const laborBurdenMarkup = round2(directLaborCost * 0.22);

    return {
        directLaborCost: round2(directLaborCost),
        laborBurden:     laborBurdenMarkup,
        totalLaborCost:  round2(directLaborCost + laborBurdenMarkup)
    };
}

module.exports = { allocateOverhead, getLaborBurdenAllocation };
