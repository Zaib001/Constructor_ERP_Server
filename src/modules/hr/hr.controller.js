"use strict";

const prisma = require("../../db");
const logger = require("../../logger");
const { 
    recordAttendance, 
    detectAnomalies 
} = require("./attendance/attendance.service");
const { 
    requestLeave, 
    approveLeave,
    rejectLeave
} = require("./leave/leave.service");
const { 
    createOvertimeRequest, 
    approveOvertime, 
    rejectOvertime,
    getApprovedOvertimeForPeriod 
} = require("./overtime/overtime.service");
const {
    submitCorrection,
    listCorrections,
    approveCorrection,
    rejectCorrection
} = require("./attendance/correction.service");
const { 
    workerProcessDraftRun, 
    workerProcessApproval 
} = require("./payroll/payroll.worker");
const { 
    reversePayroll 
} = require("./payroll/payroll.workflow");
const { 
    reviseEmployeeSalary, 
    getSalaryRevisionHistory 
} = require("../employees/employees.service");

// Zod schemas
const {
    clockAttendanceSchema,
    leaveRequestSchema,
    overtimeRequestSchema,
    generatePayrollSchema,
    salaryRevisionSchema
} = require("./hr.validation");

/**
 * Helper to fetch Employee linked to current User
 */
async function getCurrentEmployee(req) {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.employee_code) return null;
    return prisma.employee.findFirst({
        where: { company_id: req.user.companyId, employee_code: user.employee_code }
    });
}

// ─── Attendance Controller Handlers ───────────────────────────────────

async function clockAttendance(req, res, next) {
    try {
        const companyId = req.user.companyId;
        let employeeId = req.body.employee_id;
        
        // If employeeId is not provided, locate user's employee record
        if (!employeeId) {
            const employee = await getCurrentEmployee(req);
            if (!employee) return res.status(400).json({ success: false, message: "No employee record linked to user." });
            employeeId = employee.id;
        }

        // Validate structure
        const validated = clockAttendanceSchema.parse({
            employee_id: employeeId,
            action: req.body.action,
            timestamp: req.body.timestamp || new Date().toISOString()
        });

        const record = await recordAttendance(companyId, validated.employee_id, validated.action, validated.timestamp);
        return res.status(200).json({ success: true, data: record });
    } catch (err) {
        logger.error("Error in clockAttendance controller:", err);
        next(err);
    }
}

async function getAttendanceLogs(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { employeeId, startDate, endDate } = req.query;

        const where = { company_id: companyId };
        
        if (employeeId) {
            where.employee_id = employeeId;
        } else if (req.user.roleCode === "employee") {
            const employee = await getCurrentEmployee(req);
            if (employee) {
                where.employee_id = employee.id;
            } else {
                return res.status(200).json({ success: true, data: [] });
            }
        }

        if (startDate || endDate) {
            where.date = {};
            if (startDate) where.date.gte = new Date(startDate);
            if (endDate) where.date.lte = new Date(endDate);
        }

        const logs = await prisma.attendance.findMany({
            where,
            include: {
                employee: {
                    select: { name: true, employee_code: true }
                }
            },
            orderBy: { date: "desc" }
        });

        return res.status(200).json({ success: true, data: logs });
    } catch (err) {
        logger.error("Error in getAttendanceLogs controller:", err);
        next(err);
    }
}

async function getAttendanceAnomalies(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: "startDate and endDate parameters are required." });
        }

        const anomalies = await detectAnomalies(companyId, startDate, endDate);
        return res.status(200).json({ success: true, data: anomalies });
    } catch (err) {
        logger.error("Error in getAttendanceAnomalies controller:", err);
        next(err);
    }
}

// ─── Attendance Correction Handlers ───────────────────────────────────

async function handleSubmitCorrection(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const employeeId = req.body.employee_id || (await getCurrentEmployee(req))?.id;
        if (!employeeId) return res.status(400).json({ success: false, message: "No employee record linked to user." });
        
        const correction = await submitCorrection(companyId, employeeId, req.body);
        return res.status(201).json({ success: true, data: correction });
    } catch (err) {
        logger.error("Error in handleSubmitCorrection:", err);
        next(err);
    }
}

async function handleListCorrections(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const filters = {
            employee_id: req.query.employee_id,
            status: req.query.status
        };
        const corrections = await listCorrections(companyId, filters);
        return res.status(200).json({ success: true, data: corrections });
    } catch (err) {
        logger.error("Error in handleListCorrections:", err);
        next(err);
    }
}

async function handleApproveCorrection(req, res, next) {
    try {
        const { id } = req.params;
        const correction = await approveCorrection(id, req.user.id);
        return res.status(200).json({ success: true, data: correction });
    } catch (err) {
        logger.error("Error in handleApproveCorrection:", err);
        next(err);
    }
}

async function handleRejectCorrection(req, res, next) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: "Rejection reason is required." });
        const correction = await rejectCorrection(id, req.user.id, reason);
        return res.status(200).json({ success: true, data: correction });
    } catch (err) {
        logger.error("Error in handleRejectCorrection:", err);
        next(err);
    }
}

// ─── Leave Controller Handlers ────────────────────────────────────────

async function submitLeaveRequest(req, res, next) {
    try {
        const companyId = req.user.companyId;
        let employeeId = req.body.employee_id;

        if (!employeeId) {
            const employee = await getCurrentEmployee(req);
            if (!employee) return res.status(400).json({ success: false, message: "No employee record linked to user." });
            employeeId = employee.id;
        }

        const validated = leaveRequestSchema.parse({
            employee_id: employeeId,
            leave_type_id: req.body.leave_type_id,
            start_date: req.body.start_date,
            end_date: req.body.end_date,
            reason: req.body.reason
        });

        const leave = await requestLeave(companyId, validated.employee_id, {
            leave_type_id: validated.leave_type_id,
            start_date: validated.start_date,
            end_date: validated.end_date,
            reason: validated.reason
        });

        return res.status(201).json({ success: true, data: leave });
    } catch (err) {
        logger.error("Error in submitLeaveRequest controller:", err);
        next(err);
    }
}

async function handleApproveLeave(req, res, next) {
    try {
        const { requestId } = req.body;
        if (!requestId) return res.status(400).json({ success: false, message: "requestId is required." });

        const approved = await approveLeave(requestId, req.user.id);
        return res.status(200).json({ success: true, data: approved });
    } catch (err) {
        logger.error("Error in approveLeave controller:", err);
        next(err);
    }
}

async function handleRejectLeave(req, res, next) {
    try {
        const { requestId, reason } = req.body;
        if (!requestId || !reason) return res.status(400).json({ success: false, message: "requestId and reason are required." });

        const rejected = await rejectLeave(requestId, req.user.id, reason);
        return res.status(200).json({ success: true, data: rejected });
    } catch (err) {
        logger.error("Error in rejectLeave controller:", err);
        next(err);
    }
}

async function listLeaveRequests(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { employeeId, status } = req.query;

        const where = { company_id: companyId };
        if (employeeId) {
            where.employee_id = employeeId;
        } else if (req.user.roleCode === "employee") {
            const employee = await getCurrentEmployee(req);
            if (employee) {
                where.employee_id = employee.id;
            } else {
                return res.status(200).json({ success: true, data: [] });
            }
        }

        if (status) {
            where.status = status;
        }

        const requests = await prisma.leaveRequest.findMany({
            where,
            include: {
                employee: { select: { name: true, employee_code: true } },
                leave_type: true,
                approved_by: { select: { name: true } }
            },
            orderBy: { created_at: "desc" }
        });

        return res.status(200).json({ success: true, data: requests });
    } catch (err) {
        logger.error("Error in listLeaveRequests controller:", err);
        next(err);
    }
}

async function getLeaveBalances(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        let employeeId = req.query.employeeId;

        if (!employeeId) {
            const employee = await getCurrentEmployee(req);
            if (!employee) return res.status(400).json({ success: false, message: "No employee record linked to user." });
            employeeId = employee.id;
        }

        const balances = await prisma.leaveBalance.findMany({
            where: {
                employee_id: employeeId,
                year: year
            },
            include: {
                leave_type: true
            }
        });

        return res.status(200).json({ success: true, data: balances });
    } catch (err) {
        logger.error("Error in getLeaveBalances controller:", err);
        next(err);
    }
}

async function getLeaveTypes(req, res, next) {
    try {
        const types = await prisma.leaveType.findMany({
            orderBy: { name: "asc" }
        });
        return res.status(200).json({ success: true, data: types });
    } catch (err) {
        logger.error("Error in getLeaveTypes controller:", err);
        next(err);
    }
}

// ─── Overtime Controller Handlers ─────────────────────────────────────

async function submitOvertimeRequest(req, res, next) {
    try {
        const companyId = req.user.companyId;
        let employeeId = req.body.employee_id;

        if (!employeeId) {
            const employee = await getCurrentEmployee(req);
            if (!employee) return res.status(400).json({ success: false, message: "No employee record linked to user." });
            employeeId = employee.id;
        }

        const validated = overtimeRequestSchema.parse({
            employee_id: employeeId,
            date: req.body.date,
            hours: Number(req.body.hours),
            type: req.body.type,
            reason: req.body.reason
        });

        const multiplier = validated.type === "REGULAR" ? 1.5 : 2.0;

        const request = await createOvertimeRequest(companyId, validated.employee_id, {
            date: validated.date,
            hours: validated.hours,
            type: validated.type,
            multiplier: multiplier,
            reason: validated.reason
        });

        return res.status(201).json({ success: true, data: request });
    } catch (err) {
        logger.error("Error in submitOvertimeRequest controller:", err);
        next(err);
    }
}

async function handleApproveOvertime(req, res, next) {
    try {
        const { requestId } = req.body;
        if (!requestId) return res.status(400).json({ success: false, message: "requestId is required." });

        const approved = await approveOvertime(requestId, req.user.id);
        return res.status(200).json({ success: true, data: approved });
    } catch (err) {
        logger.error("Error in approveOvertime controller:", err);
        next(err);
    }
}

async function handleRejectOvertime(req, res, next) {
    try {
        const { requestId, reason } = req.body;
        if (!requestId || !reason) return res.status(400).json({ success: false, message: "requestId and reason are required." });

        const rejected = await rejectOvertime(requestId, req.user.id, reason);
        return res.status(200).json({ success: true, data: rejected });
    } catch (err) {
        logger.error("Error in rejectOvertime controller:", err);
        next(err);
    }
}

async function listOvertimeRequests(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { employeeId, status } = req.query;

        const where = { company_id: companyId };
        if (employeeId) {
            where.employee_id = employeeId;
        } else if (req.user.roleCode === "employee") {
            const employee = await getCurrentEmployee(req);
            if (employee) {
                where.employee_id = employee.id;
            } else {
                return res.status(200).json({ success: true, data: [] });
            }
        }

        if (status) {
            where.status = status;
        }

        const requests = await prisma.overtimeRequest.findMany({
            where,
            include: {
                employee: { select: { name: true, employee_code: true } },
                approved_by: { select: { name: true } }
            },
            orderBy: { date: "desc" }
        });

        return res.status(200).json({ success: true, data: requests });
    } catch (err) {
        logger.error("Error in listOvertimeRequests controller:", err);
        next(err);
    }
}

// ─── Payroll Controller Handlers ──────────────────────────────────────

async function createPayrollDraft(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const validated = generatePayrollSchema.parse(req.body);

        const run = await workerProcessDraftRun(companyId, validated.period_month, req.user.id);
        return res.status(201).json({ success: true, data: run });
    } catch (err) {
        logger.error("Error in createPayrollDraft controller:", err);
        next(err);
    }
}

async function approvePayrollRun(req, res, next) {
    try {
        const { id } = req.params;
        const run = await workerProcessApproval(id, req.user.id);
        return res.status(200).json({ success: true, data: run });
    } catch (err) {
        logger.error("Error in approvePayrollRun controller:", err);
        next(err);
    }
}

async function reversePayrollRun(req, res, next) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: "Reason for reversal is required." });

        const result = await reversePayroll(id, req.user.id, reason);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error("Error in reversePayrollRun controller:", err);
        next(err);
    }
}

async function getPayrollRuns(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { status } = req.query;

        const where = { company_id: companyId };
        if (status) {
            where.status = status;
        }

        const runs = await prisma.payrollRun.findMany({
            where,
            include: {
                creator: { select: { name: true } }
            },
            orderBy: { period_month: "desc" }
        });

        return res.status(200).json({ success: true, data: runs });
    } catch (err) {
        logger.error("Error in getPayrollRuns controller:", err);
        next(err);
    }
}

async function getPayrollRunDetails(req, res, next) {
    try {
        const { id } = req.params;
        const run = await prisma.payrollRun.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        employee: { select: { name: true, employee_code: true } },
                        payslips: true
                    }
                },
                approvals: {
                    include: { approved_by: { select: { name: true } } }
                }
            }
        });

        if (!run) return res.status(404).json({ success: false, message: "Payroll run not found." });
        return res.status(200).json({ success: true, data: run });
    } catch (err) {
        logger.error("Error in getPayrollRunDetails controller:", err);
        next(err);
    }
}

async function getPayslips(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { employeeId, periodMonth } = req.query;

        const where = {};
        
        if (employeeId) {
            where.employee_id = employeeId;
        } else if (req.user.roleCode === "employee") {
            const employee = await getCurrentEmployee(req);
            if (employee) {
                where.employee_id = employee.id;
            } else {
                return res.status(200).json({ success: true, data: [] });
            }
        }

        if (periodMonth) {
            where.payroll_item = {
                payroll_run: { period_month: periodMonth }
            };
        }

        const payslips = await prisma.payslip.findMany({
            where,
            include: {
                employee: { select: { name: true, employee_code: true } },
                payroll_item: {
                    include: {
                        payroll_run: true
                    }
                }
            },
            orderBy: { created_at: "desc" }
        });

        return res.status(200).json({ success: true, data: payslips });
    } catch (err) {
        logger.error("Error in getPayslips controller:", err);
        next(err);
    }
}

// ─── Salary Revision Controller Handlers ──────────────────────────────

async function createSalaryRevision(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const validated = salaryRevisionSchema.parse(req.body);

        const revision = await reviseEmployeeSalary(
            validated.employee_id,
            {
                basic_salary: Number(validated.basic_salary),
                housing_allowance: Number(validated.allowances?.housing_allowance || 0),
                transportation_allowance: Number(validated.allowances?.transportation_allowance || 0),
                other_allowance: Number(validated.allowances?.other_allowance || 0)
            },
            validated.reason || "Standard salary adjustment",
            validated.effective_from,
            req.user.id
        );

        return res.status(201).json({ success: true, data: revision });
    } catch (err) {
        logger.error("Error in createSalaryRevision controller:", err);
        next(err);
    }
}

async function getSalaryRevisionHistoryHandler(req, res, next) {
    try {
        const { employeeId } = req.query;
        if (!employeeId) return res.status(400).json({ success: false, message: "employeeId is required." });

        const history = await getSalaryRevisionHistory(employeeId);
        return res.status(200).json({ success: true, data: history });
    } catch (err) {
        logger.error("Error in getSalaryRevisionHistoryHandler controller:", err);
        next(err);
    }
}

// ─── Labor Cost Allocation Handlers ───────────────────────────────────

async function getLaborAllocations(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { projectId, departmentId, periodMonth } = req.query;

        const where = {};
        
        // Scope allocations to the payroll run period month if provided
        if (periodMonth) {
            where.payroll_item = {
                payroll_run: {
                    company_id: companyId,
                    period_month: periodMonth
                }
            };
        } else {
            where.payroll_item = {
                payroll_run: {
                    company_id: companyId
                }
            };
        }

        if (projectId) {
            where.project_id = projectId;
        }
        if (departmentId) {
            where.department_id = departmentId;
        }

        const allocations = await prisma.laborCostAllocation.findMany({
            where,
            include: {
                project: { select: { name: true, code: true } },
                department: { select: { name: true } },
                payroll_item: {
                    include: {
                        employee: { select: { name: true, employee_code: true } },
                        payroll_run: true
                    }
                }
            },
            orderBy: { created_at: "desc" }
        });

        return res.status(200).json({ success: true, data: allocations });
    } catch (err) {
        logger.error("Error in getLaborAllocations controller:", err);
        next(err);
    }
}

// ─── Audit Log Handlers ───────────────────────────────────────────────

async function getHRAuditLogs(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const logs = await prisma.payrollAuditLog.findMany({
            where: { company_id: companyId },
            include: {
                user: { select: { name: true, email: true } }
            },
            orderBy: { created_at: "desc" },
            take: 100
        });

        return res.status(200).json({ success: true, data: logs });
    } catch (err) {
        logger.error("Error in getHRAuditLogs controller:", err);
        next(err);
    }
}

// ─── Employee Directory Lookup (UI Utilities) ─────────────────────────

async function getHREmployees(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const employees = await prisma.employee.findMany({
            where: { company_id: companyId, is_active: true },
            orderBy: { name: "asc" }
        });
        return res.status(200).json({ success: true, data: employees });
    } catch (err) {
        logger.error("Error in getHREmployees controller:", err);
        next(err);
    }
}

async function getHRShifts(req, res, next) {
    try {
        const shifts = await prisma.shift.findMany({
            orderBy: { name: "asc" }
        });
        return res.status(200).json({ success: true, data: shifts });
    } catch (err) {
        logger.error("Error in getHRShifts controller:", err);
        next(err);
    }
}

module.exports = {
    clockAttendance,
    getAttendanceLogs,
    getAttendanceAnomalies,
    handleSubmitCorrection,
    handleListCorrections,
    handleApproveCorrection,
    handleRejectCorrection,
    submitLeaveRequest,
    handleApproveLeave,
    handleRejectLeave,
    listLeaveRequests,
    getLeaveBalances,
    getLeaveTypes,
    submitOvertimeRequest,
    handleApproveOvertime,
    handleRejectOvertime,
    listOvertimeRequests,
    createPayrollDraft,
    approvePayrollRun,
    reversePayrollRun,
    getPayrollRuns,
    getPayrollRunDetails,
    getPayslips,
    createSalaryRevision,
    getSalaryRevisionHistoryHandler,
    getLaborAllocations,
    getHRAuditLogs,
    getHREmployees,
    getHRShifts
};
