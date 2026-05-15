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

// ─── Finance Schemas ───

const InvoiceSchema = z.object({
    project_id: z.string().uuid(),
    client_name: z.string().min(1),
    invoice_date: z.string().or(z.date()),
    due_date: z.string().or(z.date()),
    subtotal: z.number().nonnegative(),
    vat_amount: z.number().nonnegative(),
    net_payable: z.number().positive(),
    items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit_price: z.number().positive(),
        total_price: z.number().positive(),
    })).min(1)
});

const VendorBillSchema = z.object({
    vendor_id: z.string().uuid(),
    project_id: z.string().uuid(),
    bill_date: z.string().or(z.date()),
    due_date: z.string().or(z.date()),
    subtotal: z.number().nonnegative(),
    vat_amount: z.number().nonnegative(),
    net_payable: z.number().positive(),
    items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit_price: z.number().positive(),
        total_price: z.number().positive(),
    })).min(1)
});

const ReceiptSchema = z.object({
    total_amount_received: z.number().positive(),
    payment_date: z.string().or(z.date()),
    bank_account_id: z.string().uuid(),
    payment_mode: z.string(),
    bank_reference: z.string().optional(),
    notes: z.string().optional(),
    allocations: z.array(z.object({
        invoice_id: z.string().uuid(),
        amount: z.number().positive()
    })).min(1)
});

const PaymentSchema = z.object({
    total_amount_paid: z.number().positive(),
    payment_date: z.string().or(z.date()),
    bank_account_id: z.string().uuid(),
    payment_mode: z.string(),
    bank_reference: z.string().optional(),
    notes: z.string().optional(),
    allocations: z.array(z.object({
        bill_id: z.string().uuid(),
        amount: z.number().positive()
    })).min(1)
});

const VoucherSchema = z.object({
    voucher_type: z.enum(["JOURNAL", "RECEIPT", "PAYMENT"]),
    posting_date: z.string().or(z.date()),
    narration: z.string().min(1),
    ledger_entries: z.array(z.object({
        account_id: z.string().uuid(),
        debit: z.number().nonnegative().optional(),
        credit: z.number().nonnegative().optional(),
        narration: z.string().optional(),
        project_id: z.string().uuid().optional(),
    })).min(2)
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
    InvoiceSchema,
    VendorBillSchema,
    ReceiptSchema,
    PaymentSchema,
    VoucherSchema
};
