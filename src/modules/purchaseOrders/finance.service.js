"use strict";

const prisma = require("../../db");

async function createInvoice(data) {
    const { poId, vendorId, invoiceNumber, amount, taxAmount, invoiceDate, dueDate, attachments } = data;

    const totalAmount = Number(amount) + (Number(taxAmount) || 0);

    const invoice = await prisma.supplierInvoice.create({
        data: {
            invoice_number: invoiceNumber,
            po_id: poId || null,
            vendor_id: vendorId,
            amount: amount,
            tax_amount: taxAmount || 0,
            total_amount: totalAmount,
            invoice_date: new Date(invoiceDate),
            due_date: dueDate ? new Date(dueDate) : null,
            status: "pending",
            attachments: attachments || null
        }
    });

    return invoice;
}

async function processPayment(data) {
    const { invoiceId, amount, paymentMethod, referenceNumber, notes } = data;

    const payment = await prisma.$transaction(async (tx) => {
        const p = await tx.supplierPayment.create({
            data: {
                invoice_id: invoiceId,
                amount: amount,
                payment_method: paymentMethod || null,
                reference_number: referenceNumber || null,
                notes: notes || null
            }
        });

        // Update invoice status
        const invoice = await tx.supplierInvoice.findUnique({
            where: { id: invoiceId },
            include: { payments: true }
        });

        const totalPaid = invoice.payments.reduce((acc, pay) => acc + Number(pay.amount), 0);
        
        if (totalPaid >= Number(invoice.total_amount)) {
            await tx.supplierInvoice.update({
                where: { id: invoiceId },
                data: { status: "paid" }
            });

            // If linked to a PO, check if PO should be 'completed'
            if (invoice.po_id) {
                // Simplified: mark PO as completed if invoice is paid
                await tx.purchaseOrder.update({
                    where: { id: invoice.po_id },
                    data: { status: "completed", updated_at: new Date() }
                });
            }
        } else {
            await tx.supplierInvoice.update({
                where: { id: invoiceId },
                data: { status: "partially_paid" }
            });
        }

        return p;
    });

    return payment;
}

async function getInvoicesByPO(poId) {
    return await prisma.supplierInvoice.findMany({
        where: { po_id: poId },
        include: {
            payments: true,
            vendor: { select: { name: true } }
        }
    });
}

module.exports = { createInvoice, processPayment, getInvoicesByPO };
