require("dotenv").config();
const prisma = require("../db");

async function check() {
    try {
        console.log("Checking ApprovalRequest with IDs...");
        const company = await prisma.company.findFirst();
        const res = await prisma.approvalRequest.create({
            data: {
                doc_type: "TEST",
                doc_id: "test-id",
                company_id: company.id,
                current_status: "pending",
                is_completed: false,
                created_at: new Date()
            }
        });
        console.log("✅ Success with company_id:", res.id);
        await prisma.approvalRequest.delete({ where: { id: res.id } });
    } catch (e) {
        console.error("❌ Failed with company_id:", e.message);
        console.error("Is it 'companyId'? Let's try...");
        try {
            const company = await prisma.company.findFirst();
            const res = await prisma.approvalRequest.create({
                data: {
                    doc_type: "TEST",
                    doc_id: "test-id",
                    companyId: company.id,
                    current_status: "pending",
                    is_completed: false,
                    created_at: new Date()
                }
            });
            console.log("✅ Success with companyId!");
            await prisma.approvalRequest.delete({ where: { id: res.id } });
        } catch (e2) {
            console.error("❌ Failed with companyId too:", e2.message);
        }
    }
    process.exit(0);
}
check();
