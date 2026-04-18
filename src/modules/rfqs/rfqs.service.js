const prisma = require("../../db");
const { applyDataScope, MODULES } = require("../../utils/scoping");

async function getAllRFQs(user, page, pageSize) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: false, prefix: "requisition", projectFilter: true });

    const skip = (page - 1) * pageSize;
    return prisma.rFQ.findMany({
        where, 
        skip: isNaN(skip) ? 0 : skip, 
        take: isNaN(pageSize) ? 50 : pageSize,
        include: { 
            requisition: { select: { pr_no: true, project: { select: { name: true } } } },
            vendors: { include: { vendor: { select: { name: true } } } } 
        },
        orderBy: { created_at: 'desc' }
    });
}

async function getRFQById(id, user) {
    const where = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: false, prefix: "requisition", projectFilter: true });
    where.id = id;

    return prisma.rFQ.findFirst({
        where,
        include: {
            requisition: { select: { pr_no: true, project: { select: { name: true, code: true } } } },
            vendors: { include: { vendor: { select: { name: true } } } },
            quotes: { include: { vendor: { select: { name: true } }, items: true } }
        }
    });
}

async function createRFQ(data, user) {
    if (!data.requisition_id) throw new Error("Requisition ID is required");
    
    const prWhere = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true });
    prWhere.id = data.requisition_id;
    
    const pr = await prisma.purchaseRequisition.findFirst({ where: prWhere });
    if (!pr) throw new Error("Reference PR not found or access denied.");
    if (pr.status !== 'approved_for_rfq') throw new Error("PR is not in a status that allows RFQ issuance.");

    return prisma.rFQ.create({
        data: {
            rfq_no: data.rfq_no || `RFQ-${Date.now()}`,
            requisition_id: data.requisition_id,
            created_by: user.id,
            notes: data.notes,
            status: "issued"
        }
    });
}

async function addVendors(rfqId, vendorIds) {
    if(!vendorIds || vendorIds.length === 0) throw new Error("At least one vendor required");
    return prisma.$transaction(vendorIds.map(vId => 
        prisma.rFQVendor.create({
            data: { rfq_id: rfqId, vendor_id: vId }
        })
    ));
}

async function submitQuote(rfqId, data) {
    return prisma.vendorQuote.create({
        data: {
            rfq_id: rfqId,
            vendor_id: data.vendor_id,
            delivery_days: data.delivery_days,
            notes: data.notes,
            status: "submitted",
            items: {
                create: data.items.map(i => ({
                    item_id: i.item_id,
                    unit_price: i.unit_price,
                    quantity: i.quantity,
                    total_price: Number(i.unit_price) * Number(i.quantity)
                }))
            }
        }
    });
}

async function compareQuotes(rfqId, data, user) {
    if (!data.selection_reason) {
        throw new Error("Selection reason is required when choosing a vendor.");
    }

    // Tenant Security: Verify RFQ belongs to user's company
    const rfqWhere = applyDataScope(user, { module: MODULES.PROCUREMENT, isWrite: true, prefix: "requisition" });
    rfqWhere.id = rfqId;
    
    const rfq = await prisma.rFQ.findFirst({ where: rfqWhere });
    if (!rfq) throw new Error("RFQ not found or access denied.");

    const comparison = await prisma.comparisonEngine.create({
        data: {
            rfq_id: rfqId,
            selected_vendor_id: data.selected_vendor_id,
            selection_reason: data.selection_reason,
            compared_by: user.id,
            comparison_snapshot: data.snapshot || {}
        }
    });
    
    await prisma.rFQ.update({
        where: { id: rfqId },
        data: { status: "vendor_selected" }
    });

    return comparison;
}

module.exports = { getAllRFQs, getRFQById, createRFQ, addVendors, submitQuote, compareQuotes };
