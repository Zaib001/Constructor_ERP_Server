"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");

/**
 * Distributes gross salary into projects and departments based on Timesheet data.
 * If no timesheets exist, allocating 100% to the employee's default department (overhead).
 */
async function allocateLaborCosts(payrollRunId, txClient) {
    const execute = async (tx) => {
        const run = await tx.payrollRun.findUnique({
            where: { id: payrollRunId },
            include: { items: { include: { employee: true } } }
        });

        if (!run) throw new Error("Payroll run not found");

        const [yearStr, monthStr] = run.period_month.split("-");
        const startDate = new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr) - 1, 1));
        const endDate = new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr), 0, 23, 59, 59));

        // Clear previous allocations for this run if any
        await tx.laborCostAllocation.deleteMany({
            where: { payroll_item: { payroll_run_id: payrollRunId } }
        });

        for (const item of run.items) {
            const grossCost = Number(item.basic_salary) + Number(item.allowances) + Number(item.overtime_pay);
            if (grossCost === 0) continue;

            // Find timesheets for the month
            const timesheets = await tx.timesheet.findMany({
                where: {
                    employee_id: item.employee_id,
                    check_in_at: { gte: startDate, lte: endDate }
                }
            });

            if (timesheets.length === 0) {
                // Overhead - 100% to department
                await tx.laborCostAllocation.create({
                    data: {
                        payroll_run_id: payrollRunId,
                        payroll_item_id: item.id,
                        department_id: item.employee.department_id,
                        amount: grossCost,
                        percentage: 100.00,
                        type: "OVERHEAD"
                    }
                });
                continue;
            }

            // Distribute based on timesheet hours
            let totalHours = 0;
            const projectHoursMap = new Map();

            timesheets.forEach(ts => {
                const hours = Number(ts.total_hours || 0);
                totalHours += hours;
                if (!projectHoursMap.has(ts.project_id)) {
                    projectHoursMap.set(ts.project_id, 0);
                }
                projectHoursMap.set(ts.project_id, projectHoursMap.get(ts.project_id) + hours);
            });

            if (totalHours === 0) {
                 // Overhead - 100% to department
                 await tx.laborCostAllocation.create({
                    data: {
                        payroll_run_id: payrollRunId,
                        payroll_item_id: item.id,
                        department_id: item.employee.department_id,
                        amount: grossCost,
                        percentage: 100.00,
                        type: "OVERHEAD"
                    }
                });
                continue;
            }

            let allocatedCostAccum = 0;
            let allocatedPercentAccum = 0;
            const projectIds = Array.from(projectHoursMap.keys());

            for (let i = 0; i < projectIds.length; i++) {
                const projId = projectIds[i];
                const hours = projectHoursMap.get(projId);
                const percent = (hours / totalHours) * 100;
                
                let costToAllocate = 0;
                let percentToAllocate = 0;

                // Handle exact rounding for the last project to prevent drift
                if (i === projectIds.length - 1) {
                    costToAllocate = grossCost - allocatedCostAccum;
                    percentToAllocate = 100.00 - allocatedPercentAccum;
                } else {
                    costToAllocate = parseFloat((grossCost * (percent / 100)).toFixed(2));
                    percentToAllocate = parseFloat(percent.toFixed(2));
                }

                await tx.laborCostAllocation.create({
                    data: {
                        payroll_run_id: payrollRunId,
                        payroll_item_id: item.id,
                        project_id: projId,
                        amount: costToAllocate,
                        percentage: percentToAllocate,
                        type: "DIRECT_LABOR"
                    }
                });

                allocatedCostAccum += costToAllocate;
                allocatedPercentAccum += percentToAllocate;
            }
        }
        
        return { message: "Labor costs allocated successfully without rounding drift." };
    };

    if (txClient) {
        return execute(txClient);
    } else {
        return prisma.$transaction(execute, { maxWait: 15000, timeout: 30000 });
    }
}

/**
 * Queues Profitability recalculations for affected projects
 */
async function triggerProfitabilitySync(companyId, payrollRunId, txClient, triggeredBy = "PAYROLL_POSTING") {
    const db = txClient || prisma;
    const run = await db.payrollRun.findUnique({
        where: { id: payrollRunId },
        select: { period_month: true }
    });

    if (!run) return 0;

    await db.recalculationQueue.create({
        data: {
            company_id: companyId,
            queue_type: "PROFITABILITY",
            period_month: run.period_month.substring(0, 7),
            status: "PENDING",
            triggered_by: triggeredBy
        }
    });

    return 1;
}

module.exports = {
    allocateLaborCosts,
    triggerProfitabilitySync
};
