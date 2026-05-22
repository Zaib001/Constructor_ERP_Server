"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./hr.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

// Mount authentication for all routes
router.use(authenticateJWT);

// ─── Attendance Routes ───────────────────────────────────────────────
router.post("/attendance/clock", controller.clockAttendance);
router.get("/attendance/logs", controller.getAttendanceLogs);
router.get("/attendance/anomalies", requirePermission("hr.attendance.read"), controller.getAttendanceAnomalies);
router.post("/attendance/corrections", controller.handleSubmitCorrection);
router.get("/attendance/corrections", controller.handleListCorrections);
router.patch("/attendance/corrections/:id/approve", requirePermission("hr.attendance.approve"), controller.handleApproveCorrection);
router.patch("/attendance/corrections/:id/reject", requirePermission("hr.attendance.approve"), controller.handleRejectCorrection);

// ─── Leave Routes ────────────────────────────────────────────────────
router.post("/leave/request", controller.submitLeaveRequest);
router.post("/leave/approve", requirePermission("hr.leave.approve"), controller.handleApproveLeave);
router.post("/leave/reject", requirePermission("hr.leave.approve"), controller.handleRejectLeave);
router.get("/leave/requests", controller.listLeaveRequests);
router.get("/leave/balances", controller.getLeaveBalances);
router.get("/leave/types", controller.getLeaveTypes);

// ─── Overtime Routes ─────────────────────────────────────────────────
router.post("/overtime/request", controller.submitOvertimeRequest);
router.post("/overtime/approve", requirePermission("hr.overtime.approve"), controller.handleApproveOvertime);
router.post("/overtime/reject", requirePermission("hr.overtime.approve"), controller.handleRejectOvertime);
router.get("/overtime/requests", controller.listOvertimeRequests);

// ─── Payroll Routes ──────────────────────────────────────────────────
router.post("/payroll/runs/draft", requirePermission("hr.payroll.manage"), controller.createPayrollDraft);
router.post("/payroll/runs/:id/approve", requirePermission("hr.payroll.approve"), controller.approvePayrollRun);
router.post("/payroll/runs/:id/reverse", requirePermission("hr.payroll.approve"), controller.reversePayrollRun);
router.get("/payroll/runs", requirePermission("hr.payroll.read"), controller.getPayrollRuns);
router.get("/payroll/runs/:id", requirePermission("hr.payroll.read"), controller.getPayrollRunDetails);
router.get("/payroll/payslips", controller.getPayslips);

// ─── Salary Revision Routes ──────────────────────────────────────────
router.post("/payroll/revisions", requirePermission("hr.salary.manage"), controller.createSalaryRevision);
router.get("/payroll/revisions/history", requirePermission("hr.salary.manage"), controller.getSalaryRevisionHistoryHandler);

// ─── Labor Cost Allocation Routes ────────────────────────────────────
router.get("/payroll/allocations", requirePermission("hr.allocation.read"), controller.getLaborAllocations);

// ─── HR Audit Log Routes ─────────────────────────────────────────────
router.get("/audit-logs", requirePermission("hr.payroll.read"), controller.getHRAuditLogs);

// ─── Directory Lookups (Utilities) ──────────────────────────────────
router.get("/directory/employees", controller.getHREmployees);
router.get("/directory/shifts", controller.getHRShifts);

module.exports = router;
