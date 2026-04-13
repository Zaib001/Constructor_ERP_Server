"use strict";

const prisma = require("../../db");

async function recordReceipt(data, actorId) {
    const { poId, receiptNumber, items, notes, attachments } = data;

    // 1. Verify PO exists and is in 'issued' status
    const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: { items: true }
    });

    if (!po) throw new Error("Purchase Order not found");
    if (po.status !== "issued" && po.status !== "partially_received") {
        throw new Error(`Cannot record receipt for PO in '${po.status}' status`);
    }

    // 2. Create Receipt and Receipt Items in a transaction
    const receipt = await prisma.$transaction(async (tx) => {
        const nr = await tx.purchaseOrderReceipt.create({
            data: {
                po_id: poId,
                receipt_number: receiptNumber || `GRN-${Date.now()}`,
                received_by: actorId,
                notes: notes || null,
                attachments: attachments || null,
                items: {
                    create: items.map(item => ({
                        po_item_id: item.poItemId,
                        quantity_received: item.quantityReceived
                    }))
                }
            },
            include: {
                items: true
            }
        });

        // 3. Update PO status based on total received quantities
        // (Simplified logic: check if all items are fully received)
        const allReceipts = await tx.purchaseOrderReceipt.findMany({
            where: { po_id: poId },
            include: { items: true }
        });

        const receivedTotals = {};
        allReceipts.forEach(r => {
            r.items.forEach(ri => {
                receivedTotals[ri.po_item_id] = (receivedTotals[ri.po_item_id] || 0) + Number(ri.quantity_received);
            });
        });
        // Add current receipt items too (though they are already in allReceipts if transaction works this way, 
        // but to be safe, let's just use allReceipts above since it was queried inside the same transaction)

        let allFullyReceived = true;
        let anyReceived = false;

        po.items.forEach(item => {
            const received = receivedTotals[item.id] || 0;
            if (received < Number(item.quantity)) {
                allFullyReceived = false;
            }
            if (received > 0) {
                anyReceived = true;
            }
        });

        let newStatus = po.status;
        if (allFullyReceived) {
            newStatus = "received";
        } else if (anyReceived) {
            newStatus = "partially_received";
        }

        if (newStatus !== po.status) {
            await tx.purchaseOrder.update({
                where: { id: poId },
                data: { status: newStatus, updated_at: new Date() }
            });
        }

        return nr;
    });

    return receipt;
}

async function getReceiptsByPO(poId) {
    return await prisma.purchaseOrderReceipt.findMany({
        where: { po_id: poId },
        include: {
            items: true
        }
    });
}

module.exports = { recordReceipt, getReceiptsByPO };
