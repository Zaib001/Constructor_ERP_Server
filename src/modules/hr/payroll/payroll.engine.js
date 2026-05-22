"use strict";

const prisma = require("../../../db");
const { getEffectiveSalaryOnDate } = require("../../employees/employees.service");

/**
 * Calculates deterministic payroll for a given employee and period.
 */
async function calculateEmployeePayroll(employeeId, periodMonth, tx) {
    const client = tx || prisma;
    // periodMonth: "YYYY-MM"
    const [yearStr, monthStr] = periodMonth.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr); // 1-12

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0)); // Last day of month
    const daysInMonth = endDate.getDate();

    // Get active salary on the last day of the month
    const effectiveSalary = await getEffectiveSalaryOnDate(employeeId, endDate, client);

    // Calculate daily and hourly rates
    const basic = effectiveSalary.basic_salary;
    const housing = effectiveSalary.allowances.housing;
    const transport = effectiveSalary.allowances.transportation;
    const other = effectiveSalary.allowances.other;
    
    const grossMonthly = basic + housing + transport + other;
    const dailyRate = grossMonthly / 30; // standard 30-day labor divisor
    const hourlyRate = dailyRate / 8; // assuming 8-hour shifts

    // Fetch employee details to check shift configuration
    const employee = await client.employee.findUnique({
        where: { id: employeeId },
        include: { shift: true }
    });

    // Fetch Attendance records
    const attendanceRecords = await client.attendance.findMany({
        where: {
            employee_id: employeeId,
            date: { gte: startDate, lte: endDate }
        }
    });

    const attendanceMap = new Map();
    let latePenaltyMinutes = 0;
    attendanceRecords.forEach(att => {
        const dateStr = att.date.toISOString().split("T")[0];
        attendanceMap.set(dateStr, att);
        latePenaltyMinutes += att.late_minutes;
        latePenaltyMinutes += att.early_minutes;
    });

    // Fetch approved leaves
    const leaves = await client.leaveRequest.findMany({
        where: {
            employee_id: employeeId,
            status: "APPROVED",
            start_date: { lte: endDate },
            end_date: { gte: startDate }
        },
        include: { leave_type: true }
    });

    // Fetch approved overtime requests
    const overtimes = await client.overtimeRequest.findMany({
        where: {
            employee_id: employeeId,
            status: "APPROVED",
            date: { gte: startDate, lte: endDate }
        }
    });

    let expectedWorkDays = 0;
    let presentDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let absentDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(Date.UTC(year, month - 1, d));
        const dateStr = date.toISOString().split("T")[0];
        const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 5 = Friday

        // Check if scheduled work day (Friday is the weekend day-off)
        const isScheduledWorkDay = dayOfWeek !== 5;
        if (isScheduledWorkDay) {
            expectedWorkDays++;
        }

        const hasAttendance = attendanceMap.has(dateStr);
        const coveringLeave = leaves.find(req => {
            const reqStart = new Date(req.start_date);
            const reqEnd = new Date(req.end_date);
            // set start/end date time boundaries to midnight
            const checkDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
            const s = new Date(Date.UTC(reqStart.getUTCFullYear(), reqStart.getUTCMonth(), reqStart.getUTCDate()));
            const e = new Date(Date.UTC(reqEnd.getUTCFullYear(), reqEnd.getUTCMonth(), reqEnd.getUTCDate()));
            return checkDate >= s && checkDate <= e;
        });

        if (hasAttendance) {
            presentDays++;
        } else if (coveringLeave) {
            if (coveringLeave.leave_type.is_paid) {
                paidLeaveDays++;
            } else {
                unpaidLeaveDays++;
            }
        } else if (isScheduledWorkDay) {
            absentDays++;
        }
    }

    // Overtime pay
    let overtimePay = 0;
    overtimes.forEach(req => {
        overtimePay += (Number(req.hours) * Number(req.multiplier) * hourlyRate);
    });

    // Deductions & Penalties
    let latePenaltyPay = (latePenaltyMinutes / 60) * hourlyRate;
    let unpaidLeavePenaltyPay = unpaidLeaveDays * dailyRate;
    let absentPenaltyPay = absentDays * dailyRate;

    let totalDeductions = latePenaltyPay + unpaidLeavePenaltyPay + absentPenaltyPay;

    // Absence loophole: if employee has no attendance and no paid leaves, they get 0 salary
    if (presentDays === 0 && paidLeaveDays === 0) {
        totalDeductions = grossMonthly;
        absentPenaltyPay = grossMonthly;
        unpaidLeavePenaltyPay = 0;
        latePenaltyPay = 0;
        absentDays = expectedWorkDays;
    }

    const netSalary = Math.max(0, grossMonthly + overtimePay - totalDeductions);

    return {
        basic_salary: basic,
        allowances: housing + transport + other,
        overtime_pay: overtimePay,
        deductions: totalDeductions,
        net_salary: netSalary,
        breakdown: {
            housing_allowance: housing,
            transportation_allowance: transport,
            other_allowance: other,
            late_penalty: latePenaltyPay,
            unpaid_leave_penalty: unpaidLeavePenaltyPay,
            absent_penalty: absentPenaltyPay,
            unpaid_leave_days: unpaidLeaveDays,
            absent_days: absentDays,
            expected_work_days: expectedWorkDays,
            present_days: presentDays,
            paid_leave_days: paidLeaveDays,
            late_minutes: latePenaltyMinutes,
            hourly_rate: hourlyRate,
            daily_rate: dailyRate
        }
    };
}

module.exports = { calculateEmployeePayroll };

