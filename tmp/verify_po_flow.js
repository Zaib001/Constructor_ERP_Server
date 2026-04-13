require("dotenv").config();
const prisma = require("../src/db");
const poService = require("../src/modules/purchaseOrders/purchaseOrders.service");
const fulfillService = require("../src/modules/purchaseOrders/fulfillment.service");
const financeService = require("../src/modules/purchaseOrders/finance.service");
const approvalService = require("../src/modules/approvals/approvals.service");

async function main() {
    console.log("Starting PO Flow Verification...");
    
    // 1. Get users and company
    const admin = await prisma.user.findFirst({ where: { roles: { code: "super_admin" } } });
    const vendor = await prisma.vendor.findFirst();
    const company = await prisma.company.findFirst();

    if (!admin || !vendor || !company) {
        console.error("Missing required seed data (admin, vendor, or company text)");
        return;
    }

    console.log(`Using Admin: ${admin.email}, Vendor: ${vendor.name}`);

    // 2. Create PO
    const poData = {
        po_number: `TEST-PO-${Date.now()}`,
        company_id: company.id,
        vendor_id: vendor.id,
        amount: 45000,
        items: [
            { itemName: "Steel Rebar", quantity: 10, unitPrice: 4500 }
        ]
    };
    
    console.log("Creating PO...");
    const po = await poService.createPO(poData, admin.id, admin.department_id);
    console.log("PO Created with ID:", po.id, "Status:", po.status);

    // 3. Check Approval Request
    const request = await prisma.approvalRequest.findFirst({ where: { doc_id: po.id } });
    if (!request) {
        console.error("No approval request generated!");
        return;
    }
    console.log("Approval Request generated:", request.id, "Status:", request.current_status);

    // 4. Approve Step(s)
    let reqState = await approvalService.getRequestById(request.id);
    while (reqState.currentStatus === "in_progress") {
        console.log(`Approving Step ${reqState.currentStep}...`);
        await approvalService.approveStep(request.id, admin.id, "LGTM", "127.0.0.1", "Test-Script");
        reqState = await approvalService.getRequestById(request.id);
    }
    
    const approvedPo = await poService.getPOById(po.id);
    console.log("PO after approvals:", approvedPo.status);

    // 5. Generate Receipt
    console.log("Generating Receipt...");
    const receipt = await fulfillService.recordReceipt({
        poId: po.id,
        items: [
            { poItemId: approvedPo.items[0].id, quantityReceived: 10 }
        ]
    }, admin.id);
    console.log("Receipt generated:", receipt.id);
    
    const receivedPo = await poService.getPOById(po.id);
    console.log("PO Status after receipt:", receivedPo.status);

    // 6. Generate Invoice
    console.log("Generating Invoice...");
    const invoice = await financeService.createInvoice({
        poId: po.id,
        vendorId: vendor.id,
        invoiceNumber: `INV-${Date.now()}`,
        amount: 45000,
        taxAmount: 4500,
        invoiceDate: new Date()
    });
    console.log("Invoice generated:", invoice.id, "Total:", invoice.total_amount);

    // 7. Process Payment
    console.log("Processing Payment...");
    const payment = await financeService.processPayment({
        invoiceId: invoice.id,
        amount: 49500,
        paymentMethod: "Bank Transfer"
    });
    console.log("Payment processed:", payment.id);

    const completedPo = await poService.getPOById(po.id);
    console.log("Final PO Status:", completedPo.status);

    console.log("Verification Complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
