const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { requestApproval } = require("../approvals/approvals.service");

/**
 * Register Payroll Status Adapter
 */
registerAdapter("PAYROLL", async ({ docId, status }) => {
    let finalStatus = "draft";
    if (status === "in_approval") finalStatus = "pending_approval";
    if (status === "approved") finalStatus = "approved";
    if (status === "rejected") finalStatus = "rejected";
    if (status === "cancelled") finalStatus = "cancelled";
    if (status === "sent_back") finalStatus = "sent_back";

    await prisma.payroll.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllPayrolls(user, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user);
    
    return await prisma.payroll.findMany({
        where,
        orderBy: { created_at: "desc" },
        include: {
            company: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
            creator: { select: { name: true } }
        }
    });
}

async function getPayrollById(id, user) {
    const where = applyDataScope(user);
    where.id = id;

    return await prisma.payroll.findFirst({
        where,
        include: {
            company: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
            creator: { select: { name: true } }
        }
    });
}

async function createPayroll(data, user) {
    const { id: actorId, companyId, isSuperAdmin } = user;
    const targetCompanyId = isSuperAdmin ? (data.company_id || companyId) : companyId;

    const payroll = await prisma.payroll.create({
        data: {
            payroll_month: data.payroll_month,
            company_id: targetCompanyId,
            department_id: data.department_id || null,
            total_amount: data.total_amount,
            status: "draft",
            created_by: actorId
        }
    });

    // Initiate Approval Request
    await requestApproval({
        docType: "PAYROLL",
        docId: payroll.id,
        amount: payroll.total_amount,
        remarks: `Payroll for month ${payroll.payroll_month}, Amount: ${payroll.total_amount} SAR`,
        items: [
            {
                itemName: `Payroll Disbursement: ${payroll.payroll_month}`,
                quantity: 1,
                unit: "Month",
                unitPrice: payroll.total_amount,
                totalPrice: payroll.total_amount
            }
        ]
    }, actorId);

    return payroll;
}

async function updatePayroll(id, data, user) {
    const where = applyDataScope(user);
    where.id = id;

    const payroll = await prisma.payroll.findFirst({ where });
    if (!payroll) throw new Error("Payroll record not found or access denied.");

    if (!["draft", "sent_back"].includes(payroll.status)) {
        throw new Error(`Payroll cannot be edited while in status: ${payroll.status}`);
    }

    return await prisma.payroll.update({
        where: { id },
        data: {
            total_amount: data.total_amount ?? payroll.total_amount,
            payroll_month: data.payroll_month ?? payroll.payroll_month,
            department_id: data.department_id ?? payroll.department_id,
            updated_at: new Date()
        }
    });
}

module.exports = { getAllPayrolls, getPayrollById, createPayroll, updatePayroll };
