"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");

/**
 * Request or Log Overtime
 */
async function createOvertimeRequest(companyId, employeeId, data) {
    // data: date, hours, type, multiplier, reason
    const otDate = new Date(data.date);

    // Check for duplicate pending/approved overtime on the same date
    const overlap = await prisma.overtimeRequest.findFirst({
        where: {
            employee_id: employeeId,
            status: { in: ["PENDING", "APPROVED"] },
            date: otDate
        }
    });

    if (overlap) {
        throw new Error("Conflict: Employee already has an overtime request logged for this date.");
    }

    // Check if the employee is on approved leave on that date
    const leaveOverlap = await prisma.leaveRequest.findFirst({
        where: {
            employee_id: employeeId,
            status: "APPROVED",
            start_date: { lte: otDate },
            end_date: { gte: otDate }
        }
    });

    if (leaveOverlap) {
        throw new Error("Conflict: Employee is on approved leave on this date and cannot log overtime.");
    }

    return prisma.overtimeRequest.create({
        data: {
            company_id: companyId,
            employee_id: employeeId,
            date: otDate,
            hours: data.hours,
            type: data.type, // REGULAR, WEEKEND, HOLIDAY
            multiplier: data.multiplier,
            reason: data.reason,
            status: "PENDING"
        }
    });
}

/**
 * Approve Overtime Request
 */
async function approveOvertime(requestId, approverId) {
    return prisma.overtimeRequest.update({
        where: { id: requestId },
        data: {
            status: "APPROVED",
            approved_by_id: approverId
        }
    });
}

/**
 * Get approved overtime hours for payroll
 */
async function getApprovedOvertimeForPeriod(employeeId, startDate, endDate) {
    const requests = await prisma.overtimeRequest.findMany({
        where: {
            employee_id: employeeId,
            status: "APPROVED",
            date: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            }
        }
    });

    let totalEquivalentHours = 0;
    requests.forEach(req => {
        totalEquivalentHours += (Number(req.hours) * Number(req.multiplier));
    });

    return totalEquivalentHours;
}
/**
 * Reject Overtime Request
 */
async function rejectOvertime(requestId, approverId, reason) {
    const request = await prisma.overtimeRequest.findUnique({
        where: { id: requestId }
    });

    if (!request) throw new Error("Overtime request not found");
    if (request.status !== "PENDING") throw new Error("Only PENDING requests can be rejected");

    return prisma.overtimeRequest.update({
        where: { id: requestId },
        data: {
            status: "REJECTED",
            approved_by_id: approverId,
            reason: request.reason ? request.reason + ` (Reject Reason: ${reason})` : `Reject Reason: ${reason}`
        }
    });
}

module.exports = {
    createOvertimeRequest,
    approveOvertime,
    getApprovedOvertimeForPeriod,
    rejectOvertime
};
