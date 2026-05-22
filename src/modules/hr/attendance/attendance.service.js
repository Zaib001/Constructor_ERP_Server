"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");
const { analyzeAttendanceAgainstShift } = require("./shift.engine");

/**
 * Handle a clock-in or clock-out event
 */
async function recordAttendance(companyId, employeeId, action, timestampStr) {
    const timestamp = new Date(timestampStr);
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, "0");
    const day = String(timestamp.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const targetDate = new Date(dateStr);

    return prisma.$transaction(async (tx) => {
        const employee = await tx.employee.findUnique({
            where: { id: employeeId },
            include: { shift: true }
        });

        if (!employee) throw new Error("Employee not found");
        const shift = employee.shift;
        if (!shift) throw new Error("Employee has no assigned shift. Cannot calculate attendance.");

        let attendance = await tx.attendance.findUnique({
            where: { employee_id_date: { employee_id: employeeId, date: targetDate } }
        });

        if (action === "CHECK_OUT" && (!attendance || !attendance.check_in)) {
            // Check if there is an open check-in on the previous day for overnight shift
            const prevDate = new Date(targetDate);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevAttendance = await tx.attendance.findUnique({
                where: { employee_id_date: { employee_id: employeeId, date: prevDate } }
            });
            if (prevAttendance && prevAttendance.check_in && !prevAttendance.check_out) {
                const [startHrs, startMins] = shift.start_time.split(":").map(Number);
                const [endHrs, endMins] = shift.end_time.split(":").map(Number);
                const startMinsTotal = startHrs * 60 + startMins;
                const endMinsTotal = endHrs * 60 + endMins;
                if (endMinsTotal < startMinsTotal) {
                    attendance = prevAttendance;
                }
            }
        }

        if (action === "CHECK_IN") {
            if (attendance && attendance.check_in) {
                throw new Error("Duplicate check-in detected for this date.");
            }

            if (!attendance) {
                attendance = await tx.attendance.create({
                    data: {
                        company_id: companyId,
                        employee_id: employeeId,
                        date: targetDate,
                        check_in: timestamp,
                        status: "PRESENT",
                    }
                });
            } else {
                attendance = await tx.attendance.update({
                    where: { id: attendance.id },
                    data: { check_in: timestamp, status: "PRESENT" }
                });
            }
        } else if (action === "CHECK_OUT") {
            if (!attendance || !attendance.check_in) {
                throw new Error("Cannot check out without a check-in record.");
            }
            if (attendance.check_out) {
                throw new Error("Duplicate check-out detected for this date.");
            }

            // Analyze shift
            const analysis = analyzeAttendanceAgainstShift(attendance.check_in, timestamp, shift);
            const workedHours = analysis.workedMinutes / 60;
            const otHours = analysis.overtimeMinutes / 60;

            attendance = await tx.attendance.update({
                where: { id: attendance.id },
                data: {
                    check_out: timestamp,
                    late_minutes: analysis.lateMinutes,
                    early_minutes: analysis.earlyMinutes,
                    worked_hours: workedHours,
                    overtime_hours: otHours
                }
            });
        }

        return attendance;
    });
}

/**
 * Identify attendance anomalies for a given period.
 */
async function detectAnomalies(companyId, startDate, endDate) {
    const attendances = await prisma.attendance.findMany({
        where: {
            company_id: companyId,
            date: { gte: new Date(startDate), lte: new Date(endDate) }
        },
        include: {
            employee: {
                select: {
                    first_name: true,
                    last_name: true,
                    employee_code: true
                }
            }
        }
    });

    const anomalies = [];

    attendances.forEach(att => {
        const empName = `${att.employee.first_name} ${att.employee.last_name} (${att.employee.employee_code})`;
        if (att.check_in && !att.check_out) {
            anomalies.push({ employee_id: att.employee_id, employee_name: empName, date: att.date, issue: "MISSING_CHECKOUT" });
        }
        if (att.late_minutes > 120) {
            anomalies.push({ employee_id: att.employee_id, employee_name: empName, date: att.date, issue: "EXTREME_LATENESS", details: `${att.late_minutes} minutes late` });
        }
        if (Number(att.overtime_hours) > 6) {
            anomalies.push({ employee_id: att.employee_id, employee_name: empName, date: att.date, issue: "IMPOSSIBLE_OVERTIME", details: `${att.overtime_hours} hours overtime` });
        }
        if (att.check_in && att.check_out && Number(att.worked_hours) === 0) {
            anomalies.push({ employee_id: att.employee_id, employee_name: empName, date: att.date, issue: "ZERO_WORKED_HOURS" });
        }
        if (att.check_in && att.check_out && (new Date(att.check_out) - new Date(att.check_in)) < 15 * 60 * 1000) {
            anomalies.push({ employee_id: att.employee_id, employee_name: empName, date: att.date, issue: "SUSPICIOUS_SHORT_SHIFT" });
        }
    });

    return anomalies;
}

module.exports = {
    recordAttendance,
    detectAnomalies
};
