require("dotenv").config();
const prisma = require("../src/db");

const inventoryService = require("../src/modules/inventory/inventory.service");
const dprService = require("../src/modules/execution/dpr/dpr.service");
const rfqsService = require("../src/modules/rfqs/rfqs.service");
const approvalsService = require("../src/modules/approvals/approvals.service");
const usersService = require("../src/modules/users/users.service");
const systemLogsController = require("../src/modules/systemLogs/systemLogs.controller");

function pass(msg) { console.log(`  ✔ ${msg}`); }
function fail(msg, err) { console.error(`  ✘ ${msg}`, err?.message || err); throw err; }

async function cleanUserData(userIds) {
    if (!userIds || userIds.length === 0) return;

    // Delete comparison engines
    await prisma.comparisonEngine.deleteMany({
        where: { compared_by: { in: userIds } }
    });

    // Delete RFQ-related records
    await prisma.vendorQuoteItem.deleteMany({
        where: {
            quote: {
                vendor: {
                    created_by: { in: userIds }
                }
            }
        }
    });
    await prisma.vendorQuote.deleteMany({
        where: {
            vendor: {
                created_by: { in: userIds }
            }
        }
    });
    await prisma.vendor.deleteMany({
        where: { created_by: { in: userIds } }
    });
    await prisma.rFQVendor.deleteMany({
        where: { rfq: { created_by: { in: userIds } } }
    });
    await prisma.rFQ.deleteMany({
        where: { created_by: { in: userIds } }
    });
    await prisma.purchaseRequisitionItem.deleteMany({
        where: { requisition: { requested_by: { in: userIds } } }
    });
    await prisma.purchaseRequisition.deleteMany({
        where: { requested_by: { in: userIds } }
    });

    // Delete DPR-related records
    await prisma.dPRItem.deleteMany({
        where: { dpr: { OR: [ { created_by: { in: userIds } }, { reviewed_by: { in: userIds } } ] } }
    });
    await prisma.resourceLog.deleteMany({
        where: { OR: [ { created_by: { in: userIds } }, { dpr: { OR: [ { created_by: { in: userIds } }, { reviewed_by: { in: userIds } } ] } } ] }
    });
    await prisma.dPR.deleteMany({
        where: { OR: [ { created_by: { in: userIds } }, { reviewed_by: { in: userIds } } ] }
    });
    await prisma.bOQItem.deleteMany({
        where: { created_by: { in: userIds } }
    });

    // Delete MRs (InventoryPlanningRequest)
    await prisma.inventoryPlanningRequest.deleteMany({
        where: { created_by: { in: userIds } }
    });

    // Delete approval steps and requests
    const reqs = await prisma.approvalRequest.findMany({
        where: {
            OR: [
                { requested_by: { in: userIds } },
                { doc_id: { in: userIds } }
            ]
        },
        select: { id: true }
    });
    const reqIds = reqs.map(r => r.id);
    await prisma.approvalStep.deleteMany({
        where: {
            OR: [
                { approver_user: { in: userIds } },
                { approval_request_id: { in: reqIds } }
            ]
        }
    });
    await prisma.approvalRequest.deleteMany({
        where: { id: { in: reqIds } }
    });

    // Delete user projects
    await prisma.userProject.deleteMany({
        where: { OR: [ { user_id: { in: userIds } }, { assigned_by: { in: userIds } } ] }
    });
}

async function bootstrap() {
    console.log("🚀 Bootstrapping test data...");

    // Find and clean existing test users' data
    const oldUsers = await prisma.user.findMany({
        where: {
            email: {
                in: [
                    "test_eng_ent@erp.com",
                    "test_pm_ent@erp.com",
                    "test_finance_ent@erp.com",
                    "test_admin_ent@erp.com"
                ]
            }
        },
        select: { id: true }
    });
    const oldUserIds = oldUsers.map(u => u.id);
    if (oldUserIds.length > 0) {
        console.log("🧹 Cleaning up old test data from previous runs...");
        await cleanUserData(oldUserIds);
    }
    
    // Find a project that has an active company
    let project = await prisma.project.findFirst({
        where: {
            company: { is_active: true }
        },
        include: { company: true }
    });
    
    let company;
    if (!project) {
        // Fallback: search for any active company
        company = await prisma.company.findFirst({ where: { is_active: true } });
        if (!company) {
            // Create a company
            company = await prisma.company.create({
                data: {
                    code: `COMP-TEST-${Date.now()}`,
                    name: "Test Dynamic Company",
                    is_active: true
                }
            });
        }
        // Create a project
        project = await prisma.project.create({
            data: {
                code: `PROJ-TEST-${Date.now()}`,
                name: "Test Dynamic Project",
                company_id: company.id,
                status: "active"
            }
        });
    } else {
        company = project.company;
    }
    
    const companyId = company.id;
    const projectId = project.id;

    // Find or create WBS
    let wbs = await prisma.wBS.findFirst({ where: { project_id: projectId } });
    if (!wbs) {
        wbs = await prisma.wBS.create({
            data: {
                project_id: projectId,
                wbs_code: `WBS-TEST-${Date.now()}`,
                name: "Test Dynamic WBS",
                status: "active"
            }
        });
    }
    const wbsId = wbs.id;

    // Find or create Store
    let store = await prisma.store.findFirst({ where: { company_id: companyId } });
    if (!store) {
        store = await prisma.store.create({
            data: {
                company_id: companyId,
                name: "Test Dynamic Store",
                is_active: true
            }
        });
    }
    const storeId = store.id;

    // Find or create Item
    let item = await prisma.item.findFirst({ where: { company_id: companyId } });
    if (!item) {
        item = await prisma.item.create({
            data: {
                company_id: companyId,
                name: `Item-Test-${Date.now()}`,
                category: "Raw Materials",
                unit: "Bag",
                standard_price: 1000
            }
        });
    } else {
        // Set item standard price to 1000 to align with test calculations
        item = await prisma.item.update({
            where: { id: item.id },
            data: { standard_price: 1000 }
        });
    }
    const itemId = item.id;

    // Load Roles
    const roles = await prisma.role.findMany();
    const pmRole = roles.find(r => r.code === "project_manager");
    const financeRole = roles.find(r => r.code === "accounts_manager");
    const engRole = roles.find(r => r.code === "site_engineer");
    const adminRole = roles.find(r => r.code === "erp_admin");

    if (!pmRole || !financeRole || !engRole || !adminRole) {
        throw new Error("Missing roles in DB. Run seed_rbac_non_destructive.js first.");
    }

    // Upsert Users
    const engUser = await prisma.user.upsert({
        where: { email: "test_eng_ent@erp.com" },
        update: { role_id: engRole.id, company_id: companyId, is_active: true },
        create: { email: "test_eng_ent@erp.com", name: "Test Eng Enterprise", password_hash: "mock", role_id: engRole.id, company_id: companyId, is_active: true }
    });
    const pmUser = await prisma.user.upsert({
        where: { email: "test_pm_ent@erp.com" },
        update: { role_id: pmRole.id, company_id: companyId, is_active: true },
        create: { email: "test_pm_ent@erp.com", name: "Test PM Enterprise", password_hash: "mock", role_id: pmRole.id, company_id: companyId, is_active: true }
    });
    const financeUser = await prisma.user.upsert({
        where: { email: "test_finance_ent@erp.com" },
        update: { role_id: financeRole.id, company_id: companyId, is_active: true },
        create: { email: "test_finance_ent@erp.com", name: "Test Finance Enterprise", password_hash: "mock", role_id: financeRole.id, company_id: companyId, is_active: true }
    });
    const adminUser = await prisma.user.upsert({
        where: { email: "test_admin_ent@erp.com" },
        update: { role_id: adminRole.id, company_id: companyId, is_active: true },
        create: { email: "test_admin_ent@erp.com", name: "Test Admin Enterprise", password_hash: "mock", role_id: adminRole.id, company_id: companyId, is_active: true }
    });

    // User contexts for service queries
    const engCtx = { id: engUser.id, userId: engUser.id, companyId, roleCode: "site_engineer" };
    const pmCtx = { id: pmUser.id, userId: pmUser.id, companyId, roleCode: "project_manager" };
    const financeCtx = { id: financeUser.id, userId: financeUser.id, companyId, roleCode: "accounts_manager" };
    const adminCtx = { id: adminUser.id, userId: adminUser.id, companyId, roleCode: "erp_admin" };

    // Clean and assign project access
    await prisma.userProject.deleteMany({
        where: { user_id: { in: [engUser.id, pmUser.id, financeUser.id, adminUser.id] } }
    });
    await prisma.userProject.createMany({
        data: [
            { user_id: engUser.id, project_id: projectId, access_type: "contributor", assigned_by: adminUser.id },
            { user_id: pmUser.id, project_id: projectId, access_type: "contributor", assigned_by: adminUser.id }
        ]
    });

    return { companyId, projectId, wbsId, storeId, itemId, engCtx, pmCtx, financeCtx, adminCtx };
}

async function testMaterialRequests(bootstrapData) {
    const { companyId, projectId, wbsId, storeId, itemId, engCtx, pmCtx, financeCtx } = bootstrapData;

    console.log("\n[TEST] Testing Material Request Routing & Thresholds...");

    // ─── Test case A: Low-value MR (Amount <= 50,000) ───
    console.log("  → Case A: Low-value MR (qty=10 * 1000 standard_price = 10,000)");
    const lowMr = await inventoryService.createMaterialRequest({
        projectId, wbsId, itemId, storeId, quantity: 10, requiredDate: new Date()
    }, engCtx);
    
    // Check approval steps created
    const lowApproval = await prisma.approvalRequest.findFirst({
        where: { doc_type: "MR", doc_id: lowMr.id },
        include: { approval_steps: true }
    });
    if (!lowApproval) throw new Error("ApprovalRequest not created for low-value MR");
    if (Number(lowApproval.amount) !== 10000) throw new Error(`MR amount mismatch: expected 10,000, got ${lowApproval.amount}`);
    if (lowApproval.total_steps !== 1) throw new Error(`Steps mismatch: expected 1 step, got ${lowApproval.total_steps}`);
    pass("Low-value MR has exactly 1 approval step with computed amount 10,000");

    // Approve Low-value MR
    await approvalsService.approveStep(lowApproval.id, pmCtx, "Approved by PM", "127.0.0.1", "Test-Device");
    const lowMrUpdated = await prisma.inventoryPlanningRequest.findUnique({ where: { id: lowMr.id } });
    if (lowMrUpdated.reservation_status !== "RESERVED") throw new Error(`Low-value MR reservation_status mismatch: expected RESERVED, got ${lowMrUpdated.reservation_status}`);
    pass("Low-value MR approved by PM successfully transitioned status to RESERVED");

    // ─── Test case B: High-value MR (Amount > 50,000) ───
    console.log("  → Case B: High-value MR (qty=60 * 1000 standard_price = 60,000)");
    const highMr = await inventoryService.createMaterialRequest({
        projectId, wbsId, itemId, storeId, quantity: 60, requiredDate: new Date()
    }, engCtx);

    const highApproval = await prisma.approvalRequest.findFirst({
        where: { doc_type: "MR", doc_id: highMr.id },
        include: { approval_steps: { orderBy: { step_order: "asc" } } }
    });
    if (!highApproval) throw new Error("ApprovalRequest not created for high-value MR");
    if (Number(highApproval.amount) !== 60000) throw new Error(`MR amount mismatch: expected 60,000, got ${highApproval.amount}`);
    if (highApproval.total_steps !== 2) throw new Error(`Steps mismatch: expected 2 steps, got ${highApproval.total_steps}`);
    pass("High-value MR has exactly 2 approval steps with computed amount 60,000");

    // Step 1: PM Approves
    await approvalsService.approveStep(highApproval.id, pmCtx, "PM Approve Step 1", "127.0.0.1", "Test-Device");
    let highMrUpdated = await prisma.inventoryPlanningRequest.findUnique({ where: { id: highMr.id } });
    if (highMrUpdated.reservation_status !== "PENDING") {
        throw new Error(`High-value MR should remain PENDING after step 1 approval, got ${highMrUpdated.reservation_status}`);
    }
    pass("High-value MR remains PENDING after PM (Step 1) approval");

    // Step 2: Finance Approves
    await approvalsService.approveStep(highApproval.id, financeCtx, "Finance Approve Step 2", "127.0.0.1", "Test-Device");
    highMrUpdated = await prisma.inventoryPlanningRequest.findUnique({ where: { id: highMr.id } });
    if (highMrUpdated.reservation_status !== "RESERVED") {
        throw new Error(`High-value MR should become RESERVED after step 2 approval, got ${highMrUpdated.reservation_status}`);
    }
    pass("High-value MR successfully transitions to RESERVED after Accounts Manager (Step 2) approval");

    // Clean up MR test data
    const mrReqs = await prisma.approvalRequest.findMany({
        where: { doc_type: "MR", doc_id: { in: [lowMr.id, highMr.id] } },
        select: { id: true }
    });
    const mrReqIds = mrReqs.map(r => r.id);
    await prisma.approvalStep.deleteMany({ where: { approval_request_id: { in: mrReqIds } } });
    await prisma.approvalRequest.deleteMany({ where: { id: { in: mrReqIds } } });
    await prisma.inventoryPlanningRequest.deleteMany({ where: { id: { in: [lowMr.id, highMr.id] } } });
}

async function testDPRs(bootstrapData) {
    const { companyId, projectId, wbsId, engCtx, pmCtx, financeCtx } = bootstrapData;

    console.log("\n[TEST] Testing DPR Routing & Thresholds...");

    // Create a BOQ item for reference
    const boqItem = await prisma.bOQItem.create({
        data: {
            company_id: companyId,
            project_id: projectId,
            wbs_id: wbsId,
            item_code: `BOQ-TEST-${Date.now()}`,
            description: "Test activity",
            planned_qty: 100,
            unit: "Sqm",
            unit_rate: 100,
            total_amount: 10000,
            created_by: engCtx.id
        }
    });

    // ─── Test case A: Low-value DPR (labor + equip log cost <= 50,000) ───
    console.log("  → Case A: Low-value DPR (Labor cost = 10,000)");
    const lowDpr = await prisma.dPR.create({
        data: {
            company_id: companyId,
            project_id: projectId,
            dpr_no: `DPR-LOW-${Date.now()}`,
            report_date: new Date(),
            weather: "Sunny",
            shift: "day",
            status: "draft",
            created_by: engCtx.id,
            items: {
                create: [{
                    wbs_id: wbsId,
                    boq_item_id: boqItem.id,
                    description: "Excavation",
                    planned_today_qty: 10,
                    actual_today_qty: 10,
                    cumulative_planned: 10,
                    cumulative_actual: 10,
                    progress_pct: 10
                }]
            }
        }
    });
    // Add low-value resource log (labor_cost = 10,000)
    await prisma.resourceLog.create({
        data: {
            company_id: companyId,
            project_id: projectId,
            dpr_id: lowDpr.id,
            resource_type: "LABOR",
            labor_cost: 10000,
            created_by: engCtx.id
        }
    });

    // Submit DPR
    await dprService.submitDPR(lowDpr.id, engCtx.id, companyId);
    
    // Check approval steps created
    const lowApproval = await prisma.approvalRequest.findFirst({
        where: { doc_type: "DPR", doc_id: lowDpr.id },
        include: { approval_steps: true }
    });
    if (!lowApproval) throw new Error("ApprovalRequest not created for low-value DPR");
    if (Number(lowApproval.amount) !== 10000) throw new Error(`DPR amount mismatch: expected 10,000, got ${lowApproval.amount}`);
    if (lowApproval.total_steps !== 1) throw new Error(`Steps mismatch: expected 1 step, got ${lowApproval.total_steps}`);
    pass("Low-value DPR has exactly 1 approval step with computed resource logs amount 10,000");

    // Approve low-value DPR step
    await approvalsService.approveStep(lowApproval.id, pmCtx, "PM Approved DPR", "127.0.0.1", "Test-Device");
    const lowDprUpdated = await prisma.dPR.findUnique({ where: { id: lowDpr.id } });
    if (lowDprUpdated.status !== "approved") throw new Error(`Low-value DPR status mismatch: expected approved, got ${lowDprUpdated.status}`);
    pass("Low-value DPR approved by PM successfully transitions to approved state");

    // ─── Test case B: High-value DPR (labor + equip log cost > 50,000) ───
    console.log("  → Case B: High-value DPR (Labor cost = 60,000)");
    const highDpr = await prisma.dPR.create({
        data: {
            company_id: companyId,
            project_id: projectId,
            dpr_no: `DPR-HIGH-${Date.now()}`,
            report_date: new Date(),
            weather: "Sunny",
            shift: "day",
            status: "draft",
            created_by: engCtx.id,
            items: {
                create: [{
                    wbs_id: wbsId,
                    boq_item_id: boqItem.id,
                    description: "Concrete work",
                    planned_today_qty: 20,
                    actual_today_qty: 20,
                    cumulative_planned: 20,
                    cumulative_actual: 20,
                    progress_pct: 20
                }]
            }
        }
    });
    // Add high-value resource logs (labor_cost = 40,000, equip_cost = 20,000)
    await prisma.resourceLog.createMany({
        data: [
            { company_id: companyId, project_id: projectId, dpr_id: highDpr.id, resource_type: "LABOR", labor_cost: 40000, created_by: engCtx.id },
            { company_id: companyId, project_id: projectId, dpr_id: highDpr.id, resource_type: "EQUIPMENT", equip_cost: 20000, created_by: engCtx.id }
        ]
    });

    // Submit DPR
    await dprService.submitDPR(highDpr.id, engCtx.id, companyId);

    const highApproval = await prisma.approvalRequest.findFirst({
        where: { doc_type: "DPR", doc_id: highDpr.id },
        include: { approval_steps: { orderBy: { step_order: "asc" } } }
    });
    if (!highApproval) throw new Error("ApprovalRequest not created for high-value DPR");
    if (Number(highApproval.amount) !== 60000) throw new Error(`DPR amount mismatch: expected 60,000, got ${highApproval.amount}`);
    if (highApproval.total_steps !== 2) throw new Error(`Steps mismatch: expected 2 steps, got ${highApproval.total_steps}`);
    pass("High-value DPR has exactly 2 approval steps with computed resource logs amount 60,000");

    // PM Approves step 1
    await approvalsService.approveStep(highApproval.id, pmCtx, "PM Approved Step 1", "127.0.0.1", "Test-Device");
    let highDprUpdated = await prisma.dPR.findUnique({ where: { id: highDpr.id } });
    if (highDprUpdated.status !== "submitted") {
        throw new Error(`High-value DPR should remain submitted after step 1 approval, got ${highDprUpdated.status}`);
    }
    pass("High-value DPR remains submitted (in approval) after PM (Step 1) approval");

    // Finance Approves step 2
    await approvalsService.approveStep(highApproval.id, financeCtx, "Finance Approved Step 2", "127.0.0.1", "Test-Device");
    highDprUpdated = await prisma.dPR.findUnique({ where: { id: highDpr.id } });
    if (highDprUpdated.status !== "approved") {
        throw new Error(`High-value DPR should become approved after step 2 approval, got ${highDprUpdated.status}`);
    }
    pass("High-value DPR successfully transitions to approved after Accounts Manager (Step 2) approval");

    // Clean up DPRs and BOQ item
    await prisma.dPRItem.deleteMany({ where: { dpr_id: { in: [lowDpr.id, highDpr.id] } } });
    await prisma.resourceLog.deleteMany({ where: { dpr_id: { in: [lowDpr.id, highDpr.id] } } });
    const reqs = await prisma.approvalRequest.findMany({
        where: { doc_type: "DPR", doc_id: { in: [lowDpr.id, highDpr.id] } },
        select: { id: true }
    });
    const reqIds = reqs.map(r => r.id);
    await prisma.approvalStep.deleteMany({ where: { approval_request_id: { in: reqIds } } });
    await prisma.approvalRequest.deleteMany({ where: { id: { in: reqIds } } });
    await prisma.dPR.deleteMany({ where: { id: { in: [lowDpr.id, highDpr.id] } } });
    await prisma.bOQItem.delete({ where: { id: boqItem.id } });
}

async function testVendorSelection(bootstrapData) {
    const { companyId, projectId, wbsId, engCtx, financeCtx } = bootstrapData;

    console.log("\n[TEST] Testing Vendor Selection Approval Workflow...");

    // Create a PurchaseRequisition
    const pr = await prisma.purchaseRequisition.create({
        data: {
            pr_no: `PR-VEND-${Date.now()}`,
            company_id: companyId,
            project_id: projectId,
            wbs_id: wbsId,
            requested_by: engCtx.id,
            reason: "Procurement required",
            status: "approved"
        }
    });

    // Create an RFQ
    const rfq = await prisma.rFQ.create({
        data: {
            rfq_no: `RFQ-VEND-${Date.now()}`,
            requisition_id: pr.id,
            created_by: engCtx.id,
            status: "issued"
        }
    });

    // Create a Vendor
    const vendor = await prisma.vendor.create({
        data: {
            company_id: companyId,
            name: `Test Supplier ${Date.now()}`,
            email: `supp-${Date.now()}@supplier.com`,
            category: "Steel",
            status: "approved",
            created_by: engCtx.id
        }
    });

    // Create a VendorQuote
    const quote = await prisma.vendorQuote.create({
        data: {
            rfq_id: rfq.id,
            vendor_id: vendor.id,
            status: "submitted",
            items: {
                create: [
                    { unit_price: 30000, quantity: 2, total_price: 60000 }
                ]
            }
        }
    });

    // Call compareQuotes
    console.log("  → Simulating comparison selection and requesting approval...");
    const comparison = await rfqsService.compareQuotes(rfq.id, {
        selected_vendor_id: vendor.id,
        selection_reason: "Best quote price and terms",
        snapshot: {}
    }, engCtx);

    // Verify RFQ status updated to pending_selection_approval
    const rfqUpdated = await prisma.rFQ.findUnique({ where: { id: rfq.id } });
    if (rfqUpdated.status !== "pending_selection_approval") {
        throw new Error(`RFQ status mismatch after comparison: expected pending_selection_approval, got ${rfqUpdated.status}`);
    }
    pass("RFQ status successfully updated to pending_selection_approval");

    // Verify VENDOR_SELECTION approval request created
    const selectionApproval = await prisma.approvalRequest.findFirst({
        where: { doc_type: "VENDOR_SELECTION", doc_id: comparison.id },
        include: { approval_steps: true }
    });
    if (!selectionApproval) throw new Error("ApprovalRequest not created for VENDOR_SELECTION");
    if (Number(selectionApproval.amount) !== 60000) throw new Error(`ApprovalRequest amount mismatch: expected 60,000, got ${selectionApproval.amount}`);
    if (selectionApproval.total_steps !== 1) throw new Error(`Steps mismatch: expected 1 step, got ${selectionApproval.total_steps}`);
    pass("VENDOR_SELECTION approval request created with amount 60,000 for Accounts Manager");

    // Accounts Manager approves selection
    await approvalsService.approveStep(selectionApproval.id, financeCtx, "Approved winning vendor selection", "127.0.0.1", "Test-Device");

    const rfqApproved = await prisma.rFQ.findUnique({ where: { id: rfq.id } });
    if (rfqApproved.status !== "vendor_selected") {
        throw new Error(`RFQ status mismatch after approval: expected vendor_selected, got ${rfqApproved.status}`);
    }
    pass("RFQ status transitioned to vendor_selected upon approval of VENDOR_SELECTION request");

    // Clean up
    const vsReqs = await prisma.approvalRequest.findMany({
        where: { doc_type: "VENDOR_SELECTION", doc_id: comparison.id },
        select: { id: true }
    });
    const vsReqIds = vsReqs.map(r => r.id);
    await prisma.approvalStep.deleteMany({ where: { approval_request_id: { in: vsReqIds } } });
    await prisma.approvalRequest.deleteMany({ where: { id: { in: vsReqIds } } });

    await prisma.vendorQuoteItem.deleteMany({ where: { quote_id: quote.id } });
    await prisma.vendorQuote.delete({ where: { id: quote.id } });
    await prisma.comparisonEngine.delete({ where: { id: comparison.id } });
    await prisma.vendor.delete({ where: { id: vendor.id } });
    await prisma.rFQVendor.deleteMany({ where: { rfq_id: rfq.id } });
    await prisma.rFQ.delete({ where: { id: rfq.id } });
    await prisma.purchaseRequisition.delete({ where: { id: pr.id } });
}

async function testAccessPermissions(bootstrapData) {
    const { engCtx, financeCtx, adminCtx } = bootstrapData;

    console.log("\n[TEST] Testing Admin/Finance Access Controls...");

    // Test listUsers works for Finance
    try {
        const usersList = await usersService.listUsers(financeCtx, { page: 1, limit: 10 });
        if (!usersList || !usersList.users) throw new Error("Failed to retrieve users list");
        pass("Accounts Manager successfully lists users via usersService");
    } catch (e) {
        fail("Accounts Manager should be allowed to list users", e);
    }

    // Test listUsers fails for Engineer
    try {
        await usersService.listUsers(engCtx, { page: 1, limit: 10 });
        throw new Error("Should have thrown Forbidden error for Engineer");
    } catch (e) {
        if (e.statusCode === 403) {
            pass("Engineer blocked from listing users with 403 Forbidden (correct)");
        } else {
            throw e;
        }
    }

    // Verify system logs controller accepts requirePermission("system.read")
    // We mock req, res, next to invoke the controller function directly
    const mockRes = {
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    
    // Test ERP Admin querying system logs
    const mockReqAdmin = { query: { page: 1, limit: 10 }, user: adminCtx };
    let nextCalled = false;
    await systemLogsController.getSystemLogs(mockReqAdmin, mockRes, (err) => { nextCalled = true; });
    if (nextCalled) throw new Error("systemLogs controller failed with next error");
    if (mockRes.statusCode && mockRes.statusCode !== 200) throw new Error(`Unexpected status querying logs: ${mockRes.statusCode}`);
    pass("System Logs controller successfully executed for ERP Admin user context");
}

async function runTests() {
    console.log("\n=========================================================");
    console.log("   RUNNING ENTERPRISE WORKFLOW INTEGRATION TESTS");
    console.log("=========================================================\n");

    let bootstrapData;
    try {
        bootstrapData = await bootstrap();
        await testMaterialRequests(bootstrapData);
        await testDPRs(bootstrapData);
        await testVendorSelection(bootstrapData);
        await testAccessPermissions(bootstrapData);

        console.log("\n\nALL ENTERPRISE WORKFLOW VERIFICATIONS PASSED SUCCESSFULLY!");
        console.log("=========================================================\n");
    } catch (err) {
        console.error("\nTest Suite Failed:", err);
        process.exit(1);
    } finally {
        // Clean up test users
        if (bootstrapData) {
            const { engCtx, pmCtx, financeCtx, adminCtx } = bootstrapData;
            const userIds = [engCtx.id, pmCtx.id, financeCtx.id, adminCtx.id];
            await cleanUserData(userIds);
            await prisma.user.deleteMany({
                where: { id: { in: userIds } }
            });
            console.log("🧹 Cleanup of test users complete.");
        }
        await prisma.$disconnect();
    }
}

runTests();
