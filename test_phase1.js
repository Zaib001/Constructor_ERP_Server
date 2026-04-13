const prisma = require('./src/db');
const initiationSvc = require('./src/modules/execution/initiation/initiation.service');
const approvalsSvc = require('./src/modules/approvals/approvals.service');

async function runTest() {
  console.log("=== Testing Week 6 Phase 1: Initiation ===");
  try {
    // 1. Get an active project to use for testing
    const project = await prisma.project.findFirst({
      where: { status: 'active' },
      include: { company: true }
    });

    if (!project) {
        console.log("No active projects found. Please create a project first.");
        return;
    }

    // 2. We need a user who will be the creator
    const user = await prisma.user.findFirst({
      where: { company_id: project.company_id }
    });

    console.log(`Using Project: ${project.name} | User: ${user.name}`);

    // 3. Test Creating a Project Plan (Master Baseline)
    console.log("\n[1] Creating Project Plan Baseline...");
    const plan = await initiationSvc.createPlan({
      project_id: project.id,
      title: "Initial Construction Baseline",
      version: "V1.0",
      description: "Test execution baseline",
      contract_value: 500000,
      start_date: new Date(),
      end_date: new Date(new Date().setMonth(new Date().getMonth() + 6))
    }, user.id, project.company_id);
    
    console.log(`✅ Plan Created. ID: ${plan.id} | Status: ${plan.status}`);

    // 4. Test adding a Long Lead Material item (Procurement Plan)
    console.log("\n[2] Creating Long Lead Procurement Requirement...");
    // Let's create a dummy WBS constraint if needed, or null
    const procItem = await initiationSvc.createProcurementItem({
      plan_id: plan.id,
      project_id: project.id,
      material_name: "Custom Elevators",
      specifications: "High-speed 10 passenger",
      required_qty: 2,
      unit: "Nos",
      lead_time_days: 90,
      is_long_lead: true,
      target_order_date: new Date(new Date().setDate(new Date().getDate() + 10)),
      required_on_site: new Date(new Date().setDate(new Date().getDate() + 100))
    }, user.id, project.company_id);

    console.log(`✅ Procurement Item created. Name: ${procItem.material_name} | Long Lead: ${procItem.is_long_lead}`);

    // 5. Test Submitting for Approval
    console.log("\n[3] Triggering Approval Engine Integrations...");
    console.log("Mocking the action plan request...");
    
    const request = await approvalsSvc.requestApproval({
      companyId: project.company_id,
      projectId: project.id,
      departmentId: user.department_id || null,
      docType: 'PROJECT_PLAN',
      docId: plan.id,
      requestedBy: user.id,
      amount: plan.contract_value || 0
    });
    
    // Updates the internal status of the module
    await initiationSvc.updatePlanStatus(plan.id, 'in_approval', project.company_id);
    console.log(`✅ Sent to Approvals Inbox! Request ID: ${request.id}`);

    const verifyPlan = await initiationSvc.getPlan(plan.id, project.company_id);
    console.log(`✅ Verified Local Status updated to: ${verifyPlan.status}`);

    console.log("\n=== Test Complete ===");

  } catch (error) {
    console.error("Test Failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
