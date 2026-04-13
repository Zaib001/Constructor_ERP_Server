require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixCorruptedApprovals() {
    console.log("Locating corrupted Approval Requests...");
    const corruptedRequests = await prisma.approvalRequest.findMany({
        where: {
            current_status: "in_progress",
            doc_type: "PR"
        }
    });

    for (const req of corruptedRequests) {
        const pr = await prisma.purchaseRequisition.findUnique({ where: { id: req.doc_id } });
        if (pr && (pr.status === "draft" || pr.status === "sent_back")) {
            console.log(`Fixing Request ${req.id} for PR ${pr.id} - PR state is ${pr.status}. Setting request to cancelled.`);
            await prisma.approvalRequest.update({
                where: { id: req.id },
                data: { current_status: "cancelled", is_completed: true, completed_at: new Date() }
            });
            await prisma.approvalStep.updateMany({
                where: { approval_request_id: req.id, status: "pending" },
                data: { status: "skipped" }
            });
        }
    }

    console.log("Cleanup complete.");
    await prisma.$disconnect();
}

fixCorruptedApprovals().catch(console.error);
