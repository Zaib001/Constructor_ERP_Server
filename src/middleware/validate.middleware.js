"use strict";

const { z } = require("zod");

/**
 * validate(schema)
 * ─────────────────────────────────────────────────────────────────────────────
 * Express middleware factory that validates `req.body` against a Zod schema.
 *
 * On failure → 400 with:
 *   { success: false, message: "Validation error", errors: [{ field, message }] }
 *
 * On success → attaches parsed+coerced body to req.validated and calls next().
 *
 * Usage:
 *   router.post("/login", validate(LoginSchema), controller.login)
 */
function validate(schema) {
    return function (req, res, next) {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            }));

            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors,
            });
        }

        // Attach parsed (coerced/trimmed) data so controllers can use it safely
        req.validated = result.data;
        next();
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared ERP Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
    email: z.string().email("Invalid email format").toLowerCase(),
    password: z.string().min(1, "Password is required"),
});

const RegisterSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").trim(),
    email: z.string().email("Invalid email format").toLowerCase(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    roleId: z.string().uuid("Invalid roleId").optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    phone: z.string().optional(),
});

const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const ApprovalRequestSchema = z.object({
    docType: z.string().min(1, "docType is required"),
    docId: z.string().uuid("docId must be a valid UUID"),
    amount: z.number().positive("amount must be a positive number").optional(),
    projectId: z.string().uuid("projectId must be a valid UUID").optional(),
    department: z.string().optional(),
    remarks: z.string().optional(),
});

const ApproveStepSchema = z.object({
    remarks: z.string().optional(),
});

const RejectStepSchema = z.object({
    remarks: z.string().min(1, "Rejection reason is required"),
});

module.exports = {
    validate,
    // Exported schemas for use in routes
    LoginSchema,
    RegisterSchema,
    ChangePasswordSchema,
    ApprovalRequestSchema,
    ApproveStepSchema,
    RejectStepSchema,
};
