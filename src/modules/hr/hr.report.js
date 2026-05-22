"use strict";

const prisma = require("../../db");

/**
 * Generates structured Payroll Summaries.
 */
async function getPayrollSummary(companyId, periodMonth) {
    const run = await prisma.payrollRun.findUnique({
        where: { company_id_period_month: { company_id: companyId, period_month: periodMonth } },
        include: {
            items: {
                include: {
                    employee: {
                        select: { name: true, employee_code: true }
                    }
                }
            }
        }
    });

    if (!run) return null;

    return {
        period_month: run.period_month,
        status: run.status,
        total_gross: Number(run.total_gross),
        total_net: Number(run.total_net),
        total_deduction: Number(run.total_deduction),
        employees_count: run.items.length,
        items: run.items.map(item => ({
            employee_name: item.employee.name,
            employee_code: item.employee.employee_code,
            basic_salary: Number(item.basic_salary),
            allowances: Number(item.allowances),
            overtime_pay: Number(item.overtime_pay),
            deductions: Number(item.deductions),
            net_salary: Number(item.net_salary)
        }))
    };
}

/**
 * Generates Labor Burden Reports (Direct vs Overhead split).
 */
async function getLaborBurdenReport(companyId, periodMonth) {
    const allocations = await prisma.laborCostAllocation.findMany({
        where: {
            payroll_item: {
                payroll_run: {
                    company_id: companyId,
                    period_month: periodMonth
                }
            }
        },
        include: {
            project: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } }
        }
    });

    let totalDirectLabor = 0;
    let totalOverhead = 0;
    const projectBreakdown = {};
    const departmentBreakdown = {};

    allocations.forEach(alloc => {
        const amt = Number(alloc.amount);
        if (alloc.type === "DIRECT_LABOR") {
            totalDirectLabor += amt;
            if (alloc.project) {
                const key = alloc.project.name;
                projectBreakdown[key] = (projectBreakdown[key] || 0) + amt;
            }
        } else {
            totalOverhead += amt;
            if (alloc.department) {
                const key = alloc.department.name;
                departmentBreakdown[key] = (departmentBreakdown[key] || 0) + amt;
            }
        }
    });

    return {
        period_month: periodMonth,
        total_direct_labor: totalDirectLabor,
        total_overhead: totalOverhead,
        total_labor_cost: totalDirectLabor + totalOverhead,
        project_breakdown: projectBreakdown,
        department_breakdown: departmentBreakdown
    };
}

module.exports = {
    getPayrollSummary,
    getLaborBurdenReport
};
