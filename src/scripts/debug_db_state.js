require("dotenv").config();
const prisma = require("../db");

async function debug() {
    console.log("🔍 Debugging Latest PR and its Approval Requests...");
    const prs = await prisma.purchaseRequisition.findMany({
        orderBy: { created_at: "desc" },
        take: 1
    });
    if (prs.length === 0) return console.log("❌ No PRs found.");
    const pr = prs[0];
    console.log(`✅ PR: ${pr.id}, Status: ${pr.status}, Company: ${pr.company_id}`);
    
    const requests = await prisma.approvalRequest.findMany({
        where: { doc_type: "PR", doc_id: pr.id },
        orderBy: { created_at: "asc" }
    });
    
    console.log(`📊 Found ${requests.length} requests:`);
    requests.forEach((r, idx) => {
        console.log(`REQ ${idx}: ID=${r.id}, Status=${r.current_status}, Company=${r.company_id}, Completed=${r.is_completed}, CreatedAt=${r.created_at}`);
    });
    
    process.exit(0);
}
debug();
