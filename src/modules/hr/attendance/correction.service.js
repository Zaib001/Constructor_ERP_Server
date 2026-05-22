"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");

/**
 * Submit an attendance correction request.
 */
async function submitCorrection(companyId, employeeId, payload) {
    const { date, reason, requested_in, requested_out } = payload;
    
    // Validate if original attendance exists
    const attendance = await prisma.attendance.findUnique({
        where: { employee_id_date: { employee_id: employeeId, date: new Date(date) } }
    });

    return prisma.$transaction(async (tx) => {
        const correction = await tx.attendanceCorrection.create({
            data: {
                company_id: companyId,
                employee_id: employeeId,
                date: new Date(date),
                reason,
                requested_in: requested_in ? new Date(requested_in) : null,
                requested_out: requested_out ? new Date(requested_out) : null,
                status: "PENDING"
            }
        });

        return correction;
    });
}

/**
 * List corrections.
 */
async function listCorrections(companyId, filters) {
    const where = { company_id: companyId };
    if (filters.employee_id) where.employee_id = filters.employee_id;
    if (filters.status) where.status = filters.status;

    return prisma.attendanceCorrection.findMany({
        where,
        include: { employee: true, approved_by: true },
        orderBy: { created_at: "desc" }
    });
}

/**
 * Approve an attendance correction.
 */
async function approveCorrection(correctionId, approverId) {
    return prisma.$transaction(async (tx) => {
        const correction = await tx.attendanceCorrection.findUnique({
            where: { id: correctionId },
            include: { employee: true }
        });

        if (!correction) throw new Error("Correction request not found");
        if (correction.status !== "PENDING") throw new Error("Correction is not in PENDING state");

        // Actually apply the correction to the Attendance table
        const attendance = await tx.attendance.findUnique({
            where: { employee_id_date: { employee_id: correction.employee_id, date: correction.date } }
        });

        if (!attendance) {
            // Create attendance if not exists but they checked in
            await tx.attendance.create({
                data: {
                    company_id: correction.company_id,
                    employee_id: correction.employee_id,
                    date: correction.date,
                    check_in: correction.requested_in,
                    check_out: correction.requested_out,
                    status: "PRESENT",
                    is_manual: true
                }
            });
        } else {
            await tx.attendance.update({
                where: { id: attendance.id },
                data: {
                    check_in: correction.requested_in || attendance.check_in,
                    check_out: correction.requested_out || attendance.check_out,
                    is_manual: true
                }
            });
        }

        // Re-analyze attendance against shift (since times changed)
        const updatedAttendance = await tx.attendance.findUnique({
            where: { employee_id_date: { employee_id: correction.employee_id, date: correction.date } }
        });

        if (updatedAttendance && updatedAttendance.check_in && updatedAttendance.check_out) {
            const shift = await tx.shift.findFirst({
                where: { employees: { some: { id: correction.employee_id } } }
            });
            if (shift) {
                const { analyzeAttendanceAgainstShift } = require("./shift.engine");
                const analysis = analyzeAttendanceAgainstShift(updatedAttendance.check_in, updatedAttendance.check_out, shift);
                
                await tx.attendance.update({
                    where: { id: updatedAttendance.id },
                    data: {
                        late_minutes: analysis.lateMinutes,
                        early_minutes: analysis.earlyMinutes,
                        worked_hours: analysis.workedHours,
                        overtime_hours: analysis.overtimeHours
                    }
                });
            }
        }

        const approvedCorrection = await tx.attendanceCorrection.update({
            where: { id: correctionId },
            data: {
                status: "APPROVED",
                approved_by_id: approverId
            }
        });

        return approvedCorrection;
    });
}

/**
 * Reject an attendance correction.
 */
async function rejectCorrection(correctionId, approverId, reason) {
    const correction = await prisma.attendanceCorrection.findUnique({ where: { id: correctionId } });
    if (!correction) throw new Error("Correction not found");
    if (correction.status !== "PENDING") throw new Error("Only PENDING requests can be rejected");

    return prisma.attendanceCorrection.update({
        where: { id: correctionId },
        data: {
            status: "REJECTED",
            approved_by_id: approverId,
            reason: correction.reason + ` (Reject Reason: ${reason})`
        }
    });
}

module.exports = {
    submitCorrection,
    listCorrections,
    approveCorrection,
    rejectCorrection
};
