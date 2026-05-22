"use strict";

const { z } = require("zod");

// ─── Shared Base Schemas ──────────────────────────────────────────
const uuidSchema = z.string().uuid();
const decimalSchema = z.number().nonnegative("Value must be a positive number");

// ─── 1. Employee Management Schemas ───────────────────────────────
const createEmployeeSchema = z.object({
    name: z.string().min(2).max(200),
    department_id: uuidSchema.optional(),
    designation_id: uuidSchema.optional(),
    shift_id: uuidSchema.optional(),
    joining_date: z.string().datetime().optional(), // Expected in ISO format
    basic_salary: decimalSchema.optional(),
    housing_allowance: decimalSchema.optional(),
    transportation_allowance: decimalSchema.optional(),
    other_allowance: decimalSchema.optional(),
    bank_name: z.string().max(200).optional(),
    bank_account_name: z.string().max(200).optional(),
    bank_iban: z.string().max(100).optional(),
});

// ─── 2. Attendance & Shift Schemas ────────────────────────────────
const clockAttendanceSchema = z.object({
    employee_id: uuidSchema,
    action: z.enum(["CHECK_IN", "CHECK_OUT"]),
    timestamp: z.string().datetime(), // Expected in ISO format
    lat: z.number().optional(),
    lng: z.number().optional()
});

const attendanceCorrectionSchema = z.object({
    employee_id: uuidSchema,
    date: z.string().datetime(), // The affected date
    reason: z.string().min(5),
    requested_in: z.string().datetime().optional(),
    requested_out: z.string().datetime().optional()
}).refine(data => data.requested_in || data.requested_out, {
    message: "Must provide either requested_in or requested_out"
});

// ─── 3. Overtime & Leave Schemas ──────────────────────────────────
const overtimeRequestSchema = z.object({
    employee_id: uuidSchema,
    date: z.string().datetime(),
    hours: decimalSchema,
    type: z.enum(["REGULAR", "WEEKEND", "HOLIDAY"]),
    reason: z.string().optional()
});

const leaveRequestSchema = z.object({
    employee_id: uuidSchema,
    leave_type_id: uuidSchema,
    start_date: z.string().datetime(),
    end_date: z.string().datetime(),
    reason: z.string().optional()
});

// ─── 4. Payroll Engine Schemas ────────────────────────────────────
const generatePayrollSchema = z.object({
    period_month: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format")
});

const approvePayrollSchema = z.object({
    payroll_run_id: uuidSchema,
    action: z.enum(["APPROVE", "REJECT"]),
    comments: z.string().optional()
});

// ─── 5. Retroactive Adjustments ───────────────────────────────────
const salaryRevisionSchema = z.object({
    employee_id: uuidSchema,
    effective_from: z.string().datetime(),
    basic_salary: decimalSchema,
    allowances: z.object({
        housing_allowance: decimalSchema.optional(),
        transportation_allowance: decimalSchema.optional(),
        other_allowance: decimalSchema.optional()
    }).optional(),
    reason: z.string().optional()
});

module.exports = {
    createEmployeeSchema,
    clockAttendanceSchema,
    attendanceCorrectionSchema,
    overtimeRequestSchema,
    leaveRequestSchema,
    generatePayrollSchema,
    approvePayrollSchema,
    salaryRevisionSchema
};
