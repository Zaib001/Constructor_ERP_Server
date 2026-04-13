require("dotenv").config();
const prisma = require("../db");
const approvalsService = require("../modules/approvals/approvals.service");
const prService = require("../modules/purchaseRequisitions/purchaseRequisitions.service");

async function verifyScenario() {
    console.log("🧪 Starting Final Real-World Approval Scenario Test...");

    try {
        // 0. Cleanup old test data
        console.log("🧹 Cleaning up old PRs and Approval Requests...");
        // Delete in order of constraints: Steps -> Items -> Requests -> PRs
        await prisma.approvalStep.deleteMany({
            where: { approval_requests: { is: { doc_type: "PR" } } }
        });
        await prisma.approvalRequestItem.deleteMany({
            where: { approval_requests: { is: { doc_type: "PR" } } }
        });
        await prisma.approvalRequest.deleteMany({ where: { doc_type: "PR" } });
        await prisma.purchaseRequisition.deleteMany({});
        console.log("✅ Cleanup complete.");

        // 1. Setup Users
        console.log("🔍 Finding test users...");
        const engineer = await prisma.user.findFirst({ where: { email: "engineer@erp.com" } });
        if (!engineer) throw new Error("Engineer user not found in database. Please run seed first.");
        
        const pm = await prisma.user.findFirst({ where: { email: "pm@erp.com" } });
        if (!pm) throw new Error("PM user not found in database.");

        const deptHead = await prisma.user.findFirst({ where: { email: "depthead@erp.com" } });
        if (!deptHead) throw new Error("Dept Head user not found in database.");

        const userProj = await prisma.userProject.findFirst({ 
            where: { user_id: engineer.id } 
        });
        if (!userProj) throw new Error("Engineer has no project assignments. Seed may be incomplete.");

        const project = await prisma.project.findUnique({ where: { id: userProj.project_id } });
        if (!project) throw new Error("Assigned project record missing.");

        const wbs = await prisma.wBS.findFirst({ where: { project_id: project.id } });
        if (!wbs) throw new Error("WBS for project not found.");

        const item = await prisma.item.findFirst();
        if (!item) throw new Error("No items found in catalog. Seed failed or empty.");

        const roleDeptHead = await prisma.role.findFirst({ where: { code: "department_head" } });
        if (!roleDeptHead) throw new Error("Department Head role not found.");

        console.log(`✅ Ready: Engineer=${engineer.id}, PM=${pm.id}, Project=${project.code}`);

        // 2. Ensure Matrix has 2 steps: PM -> Dept Head
        console.log("⚙️ Configuring Approval Matrix for 2-step PR flow...");
        await prisma.approvalMatrix.deleteMany({ where: { doc_type: "PR" } });
        await prisma.approvalMatrix.createMany({
            data: [
                { company_id: engineer.company_id, doc_type: "PR", step_order: 1, role_id: pm.role_id, min_amount: 0 },
                { company_id: engineer.company_id, doc_type: "PR", step_order: 2, role_id: roleDeptHead.id, min_amount: 0 }
            ]
        });

        // 3. Site Engineer creates PR
        console.log("📝 Step 1: Site Engineer creating PR...");
        const engineerCtx = { 
            id: engineer.id, 
            companyId: engineer.company_id, 
            roleCode: "site_engineer",
            isSuperAdmin: false 
        };
        const pmCtx = { 
            id: pm.id, 
            companyId: pm.company_id, 
            roleCode: "project_manager",
            isSuperAdmin: false 
        };
        const headCtx = { 
            id: deptHead.id, 
            companyId: deptHead.company_id, 
            roleCode: "department_head",
            isSuperAdmin: false 
        };

        const pr = await prService.createPR({
            project_id: project.id,
            wbs_id: wbs.id,
            reason: "Initial Request",
            items: [{ item_id: item.id, quantity: 10, remarks: "Seed test" }]
        }, engineerCtx);

        let approvalRequest = await prisma.approvalRequest.findFirst({
            where: { doc_type: "PR", doc_id: pr.id },
            orderBy: { created_at: "desc" }
        });
        console.log(`✅ PR created: ${pr.id}, Approval Request: ${approvalRequest.id}, Status: ${approvalRequest.current_status}`);

        // 4. PM sends back
        console.log("🔙 Step 2: PM sending back request...");
        await approvalsService.sendBackStep(approvalRequest.id, pmCtx, "Please add more details to the reason.", "127.0.0.1", "Test-Device");
        
        approvalRequest = await prisma.approvalRequest.findUnique({ where: { id: approvalRequest.id } });
        const updatedPR = await prisma.purchaseRequisition.findUnique({ where: { id: pr.id } });
        console.log(`✅ Status after Send Back: Request=${approvalRequest.current_status}, PR=${updatedPR.status}`);

        // 5. Site Engineer edits and resubmits
        console.log("🔄 Step 3: Site Engineer updating and resubmitting...");
        await prService.updatePR(pr.id, { reason: "Urgent: Revised with more details for foundation." }, engineerCtx);
        await prService.submitPR(pr.id, engineerCtx);

        const newApprovalRequest = await prisma.approvalRequest.findFirst({
            where: { doc_type: "PR", doc_id: pr.id },
            orderBy: { created_at: "desc" }
        });
        const oldRequest = await prisma.approvalRequest.findUnique({ where: { id: approvalRequest.id } });

        console.log(`✅ New Cycle created: NewRequestID=${newApprovalRequest.id}, OldRequestStatus=${oldRequest.current_status}`);
        if (oldRequest.current_status !== "cancelled") throw new Error("Old request should be marked as cancelled/superseded!");

        // 6. PM approves
        console.log("✅ Step 4: PM approving...");
        await approvalsService.approveStep(newApprovalRequest.id, pmCtx, "Technical specs verified.", "127.0.0.1", "Test-Device");
        
        const afterPM = await prisma.approvalRequest.findUnique({ where: { id: newApprovalRequest.id } });
        console.log(`✅ After PM: Current Step=${afterPM.current_step}, Status=${afterPM.current_status}`);

        // 7. Dept Head approves
        console.log("🏆 Step 5: Dept Head final approval...");
        await approvalsService.approveStep(newApprovalRequest.id, headCtx, "Budget approved.", "127.0.0.1", "Test-Device");

        const finalRequest = await prisma.approvalRequest.findUnique({ where: { id: newApprovalRequest.id } });
        const finalPR = await prisma.purchaseRequisition.findUnique({ where: { id: pr.id } });

        console.log(`✅ Scenario Complete: Final Request Status=${finalRequest.current_status}, Final PR Status=${finalPR.status}`);
        
        if (finalPR.status !== "approved_for_rfq") throw new Error("PR should be approved_for_rfq at the end!");

        console.log("\n✨ ALL TESTS PASSED! OVERLAPPING HISTORY PRESERVED.");

    } catch (error) {
        console.error("❌ Scenario Failed!");
        console.error("Message:", error.message);
        if (error.code) console.error("Code:", error.code);
        if (error.clientVersion) console.error("Prisma Version:", error.clientVersion);
        console.error("Stack:", error.stack);
        
        // If it's a Prisma error, it might have more details
        if (error.meta) {
            console.error("Meta:", JSON.stringify(error.meta, null, 2));
        }
        
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyScenario();
