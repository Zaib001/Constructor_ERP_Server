"use strict";

const prisma = require("../../../db");

/**
 * Request Leave
 */
async function requestLeave(companyId, employeeId, data) {
    // data: leave_type_id, start_date, end_date, reason
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive

    // Check for overlapping approved/pending leave requests
    const overlap = await prisma.leaveRequest.findFirst({
        where: {
            employee_id: employeeId,
            status: { in: ["PENDING", "APPROVED"] },
            start_date: { lte: end },
            end_date: { gte: start }
        }
    });

    if (overlap) {
        throw new Error("Date conflict: Employee has an overlapping leave request for this period.");
    }

    // Check for approved overtime requests within the leave period
    const otOverlap = await prisma.overtimeRequest.findFirst({
        where: {
            employee_id: employeeId,
            status: "APPROVED",
            date: { gte: start, lte: end }
        }
    });

    if (otOverlap) {
        throw new Error("Conflict: Employee has approved overtime request logged within this date range.");
    }

    return prisma.leaveRequest.create({
        data: {
            company_id: companyId,
            employee_id: employeeId,
            leave_type_id: data.leave_type_id,
            start_date: start,
            end_date: end,
            days: diffDays,
            reason: data.reason,
            status: "PENDING"
        }
    });
}

/**
 * Approve Leave and Deduct Balance
 */
async function approveLeave(requestId, approverId) {
    return prisma.$transaction(async (tx) => {
        const request = await tx.leaveRequest.findUnique({
            where: { id: requestId },
            include: { leave_type: true }
        });

        if (!request) throw new Error("Leave request not found");
        if (request.status !== "PENDING") throw new Error("Leave request is already processed");

        // Update request
        const approved = await tx.leaveRequest.update({
            where: { id: requestId },
            data: { status: "APPROVED", approved_by_id: approverId }
        });

        const year = request.start_date.getFullYear();

        // Update balance if paid
        if (request.leave_type.is_paid) {
            const balance = await tx.leaveBalance.findUnique({
                where: { employee_id_leave_type_id_year: {
                    employee_id: request.employee_id,
                    leave_type_id: request.leave_type_id,
                    year: year
                }}
            });

            if (!balance || Number(balance.balance) < Number(request.days)) {
                throw new Error("Insufficient leave balance");
            }

            await tx.leaveBalance.update({
                where: { id: balance.id },
                data: {
                    total_used: { increment: request.days },
                    balance: { decrement: request.days }
                }
            });
        }

        return approved;
    });
}

/**
 * Reject Leave
 */
async function rejectLeave(requestId, approverId, reason) {
    const request = await prisma.leaveRequest.findUnique({
        where: { id: requestId }
    });

    if (!request) throw new Error("Leave request not found");
    if (request.status !== "PENDING") throw new Error("Only PENDING requests can be rejected");

    return prisma.leaveRequest.update({
        where: { id: requestId },
        data: {
            status: "REJECTED",
            approved_by_id: approverId,
            reason: request.reason ? request.reason + ` (Reject Reason: ${reason})` : `Reject Reason: ${reason}`
        }
    });
}

module.exports = {
    requestLeave,
    approveLeave,
    rejectLeave
};
