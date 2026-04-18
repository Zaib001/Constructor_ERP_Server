const prisma = require('../src/db');
async function run() { 
    try { 
        console.log("Unlinking and wiping child foreign key relations...");
        
        // Unlink Optional FKs for Vendors
        await prisma.purchaseOrder.updateMany({ data: { vendor_id: null } }).catch(() => {});
        await prisma.supplierInvoice.updateMany({ data: { vendor_id: null } }).catch(() => {});
        await prisma.supplierPayment.updateMany({ data: { vendor_id: null } }).catch(() => {});
        await prisma.rFQVendor.deleteMany().catch(() => {});
        await prisma.vendorQuote.deleteMany().catch(() => {});
        
        // Unlink Optional FKs for PRs
        await prisma.purchaseOrder.updateMany({ data: { requisition_id: null } }).catch(() => {});
        await prisma.rFQ.updateMany({ data: { requisition_id: null } }).catch(() => {});
        await prisma.excessMaterial.updateMany({ data: { pr_no: null } }).catch(() => {});
        
        // Delete Hard Children (Mandatory FKs)
        await prisma.purchaseRequisitionItem.deleteMany().catch(() => {});
        await prisma.pRApproval.deleteMany().catch(() => {});

        console.log("Relations processed. Deleting PRs and Vendors...");
        
        const prResult = await prisma.purchaseRequisition.deleteMany(); 
        console.log(`Successfully deleted ${prResult.count} Purchase Requisitions.`); 
        
        const vendorResult = await prisma.vendor.deleteMany(); 
        console.log(`Successfully deleted ${vendorResult.count} Vendors.`); 
        
    } catch(e) { 
        console.error('Deletion failed:', e); 
    } 
} 
run().catch(console.dir);
