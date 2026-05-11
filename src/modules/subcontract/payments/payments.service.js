"use strict";

const prisma = require("../../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../../utils/scoping");
const { logAudit } = require("../../../utils/auditLogger");
const utils = require("../subcontract.utils");

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

// ─── Service Logic ───────────────────────────────────────────────────────────

async function createPayment(data, user, ipAddress, deviceInfo) {
    const { 
        raBillId, paymentDate, amountPaid, paymentMethod, 
        referenceNo, financeTransactionId, remarks 
    } = data;

    const { companyId, id: userId } = user;

    const payment = await prisma.$transaction(async (tx) => {
        // 1. Validate Bill
        const bill = await tx.rABill.findFirst({
            where: { id: raBillId, company_id: companyId }
        });
        if (!bill) throw new AppError("RA Bill not found", 404);
        if (bill.status !== "certified" && bill.status !== "partially_paid") {
            throw new AppError(`Cannot pay RA Bill in status: ${bill.status}. It must be certified or partially paid.`, 400);
        }

        if (bill.status === "paid") {
            throw new AppError("RA Bill is already fully paid", 400);
        }

        // 2. Validate Amount using central util
        const previousPayments = await tx.subcontractPayment.aggregate({
            where: { ra_bill_id: raBillId },
            _sum: { amount_paid: true }
        });
        const totalPaidBefore = previousPayments._sum.amount_paid || 0;
        
        try {
            utils.validatePaymentLimits(bill.net_payable, totalPaidBefore, amountPaid);
        } catch (err) {
            throw new AppError(err.message, 400);
        }

        // 3. Create Payment
        const paymentRecord = await tx.subcontractPayment.create({
            data: {
                company_id: companyId,
                project_id: bill.project_id,
                ra_bill_id: raBillId,
                payment_date: new Date(paymentDate),
                amount_paid: amountPaid,
                payment_method: paymentMethod,
                reference_no: referenceNo,
                finance_transaction_id: financeTransactionId || null,
                status: "completed",
                processed_by: userId,
                processed_at: new Date(),
                status_logs: {
                    create: {
                        status_from: "none",
                        status_to: "completed",
                        remarks: remarks || "Payment processed",
                        created_by: userId
                    }
                }
            }
        });

        // 4. Update Bill Status
        const totalPaidAfter = Number(totalPaidBefore) + Number(amountPaid);
        const newStatus = totalPaidAfter >= Number(bill.net_payable) - 0.01 ? "paid" : "partially_paid";
        
        await tx.rABill.update({
            where: { id: raBillId },
            data: { status: newStatus }
        });

        return paymentRecord;
    });

    logAudit({
        userId,
        module: "subcontract",
        entity: "subcontract_payment",
        entityId: payment.id,
        action: "CREATE_PAYMENT",
        afterData: { raBillId, amountPaid },
        ipAddress,
        deviceInfo
    });

    return payment;
}

async function getPayments(user, filters = {}) {
    const { projectId, raBillId, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.SUBCONTRACT, projectFilter: true });

    if (projectId) where.project_id = projectId;
    if (raBillId) where.ra_bill_id = raBillId;

    const [data, total] = await Promise.all([
        prisma.subcontractPayment.findMany({
            where,
            include: {
                project: { select: { name: true } },
                ra_bill: { select: { ra_bill_no: true } },
                processor: { select: { name: true } }
            },
            orderBy: { payment_date: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.subcontractPayment.count({ where })
    ]);

    return { data, total, page, pageSize };
}

module.exports = {
    createPayment,
    getPayments
};
