require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({
    connectionString,
    max: 8,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🚀 Seeding Week 6: Project Execution Data...");

    // 1. Find Core Entities
    const project = await prisma.project.findUnique({ where: { code: "PRJ-NEOM-9" } });
    const engineer = await prisma.user.findUnique({ where: { email: "engineer@erp.com" } });
    const manager = await prisma.user.findUnique({ where: { email: "pm@erp.com" } });

    if (!project || !engineer || !manager) {
        console.error("❌ Required seed data (Project/Users) not found. Run seed_rbac_enterprise.js first.");
        return;
    }

    const companyId = project.company_id;

    // 2. Clean existing Week 6 data for this project to allow re-runs
    console.log("🧹 Cleaning old execution data...");
    await prisma.progressInvoice.deleteMany({ where: { project_id: project.id } });
    await prisma.variationOrder.deleteMany({ where: { project_id: project.id } });
    await prisma.hindranceLog.deleteMany({ where: { project_id: project.id } });
    await prisma.riskRegister.deleteMany({ where: { project_id: project.id } });
    await prisma.dPR.deleteMany({ where: { project_id: project.id } });
    await prisma.wBS.deleteMany({ where: { project_id: project.id } });

    // 3. Create a Detailed WBS Hierarchy
    console.log("📐 Creating WBS Tree...");
    
    // Level 1: Mobilization
    const wbsMob = await prisma.wBS.create({
        data: {
            project_id: project.id,
            wbs_code: "1.0",
            name: "Site Mobilization & Temporary Facilities",
            start_date: new Date("2024-03-01"),
            end_date: new Date("2024-03-15"),
            weight_pct: 10,
            planned_qty: 1,
            unit: "LS"
        }
    });

    // Level 1: Substructure
    const wbsSub = await prisma.wBS.create({
        data: {
            project_id: project.id,
            wbs_code: "2.0",
            name: "Substructure & Foundations",
            start_date: new Date("2024-03-16"),
            end_date: new Date("2024-04-30"),
            weight_pct: 40
        }
    });

    // Level 2: Substructure -> Excavation
    const wbsExc = await prisma.wBS.create({
        data: {
            project_id: project.id,
            parent_id: wbsSub.id,
            wbs_code: "2.1",
            name: "Mass Excavation & Earthworks",
            start_date: new Date("2024-03-16"),
            end_date: new Date("2024-03-31"),
            planned_qty: 5000,
            unit: "M3",
            weight_pct: 15
        }
    });

    // Level 2: Substructure -> Foundation
    const wbsFnd = await prisma.wBS.create({
        data: {
            project_id: project.id,
            parent_id: wbsSub.id,
            wbs_code: "2.2",
            name: "Concrete Foundations & Footings",
            start_date: new Date("2024-04-01"),
            end_date: new Date("2024-04-30"),
            planned_qty: 1200,
            unit: "M3",
            weight_pct: 25
        }
    });

    // 4. Add Cost Codes & Budgets
    console.log("💰 Adding Budgets...");
    await prisma.costCode.createMany({
        data: [
            { wbs_id: wbsExc.id, category: "labor", budget_amount: 45000 },
            { wbs_id: wbsExc.id, category: "equipment", budget_amount: 85000 },
            { wbs_id: wbsFnd.id, category: "material", budget_amount: 250000 },
            { wbs_id: wbsFnd.id, category: "labor", budget_amount: 120000 }
        ]
    });

    // 5. Create Daily Progress Reports (DPRs)
    console.log("📝 Generating Site Diaries (DPRs)...");
    
    // DPR 1: 2 Days Ago (Approved)
    const dpr1 = await prisma.dPR.create({
        data: {
            project_id: project.id,
            company_id: companyId,
            dpr_no: "DPR-NEOM-001",
            report_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            weather: "Clear / Sunny",
            status: "approved",
            created_by: engineer.id,
            submitted_by: engineer.id,
            reviewed_by: manager.id,
            executive_summary: "Major excavation work in sector A completed successfully.",
            items: {
                create: [
                    { wbs_id: wbsExc.id, actual_today_qty: 450, progress_pct: 9 }
                ]
            },
            resource_logs: {
                create: [
                    { 
                        company_id: companyId, project_id: project.id, created_by: engineer.id,
                        resource_type: "LABOR", trade: "General Labor", headcount: 12, hours_worked: 8 
                    },
                    { 
                        company_id: companyId, project_id: project.id, created_by: engineer.id,
                        resource_type: "EQUIPMENT", equipment_no: "EXCAV-01", hours_used: 10 
                    }
                ]
            }
        }
    });

    // DPR 2: Yesterday (Submitted)
    const dpr2 = await prisma.dPR.create({
        data: {
            project_id: project.id,
            company_id: companyId,
            dpr_no: "DPR-NEOM-002",
            report_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            weather: "High Winds",
            status: "submitted",
            created_by: engineer.id,
            submitted_by: engineer.id,
            executive_summary: "Wind slowed down crane operations, but excavation continued.",
            items: {
                create: [
                    { wbs_id: wbsExc.id, actual_today_qty: 300, progress_pct: 6 }
                ]
            }
        }
    });

    // 6. Update WBS with current progress (simulating actuals)
    await prisma.wBS.update({
        where: { id: wbsExc.id },
        data: { progress_pct: 15, actual_qty: 750 }
    });

    // 7. Add Variation Orders
    console.log("🔄 Adding Variation Orders...");
    await prisma.variationOrder.create({
        data: {
            project_id: project.id,
            company_id: companyId,
            vo_no: "VO-NEOM-001",
            vo_type: "ADDITION",
            description: "Extra rock breaking required in sector B due to unforeseen soil conditions.",
            original_contract_value: 1500000,
            variation_amount: 75000,
            revised_contract_value: 1575000,
            status: "approved",
            created_by: manager.id,
            approved_by: manager.id
        }
    });

    // 8. Add Hindrances
    console.log("🚧 Logging Site Hindrances...");
    await prisma.hindranceLog.create({
        data: {
            project_id: project.id,
            company_id: companyId,
            hindrance_date: new Date(),
            category: "WEATHER",
            description: "Work stopped for 4 hours due to intense sandstorm.",
            impact_hours: 4,
            status: "open",
            created_by: engineer.id
        }
    });

    // 9. Add Progress Invoice
    console.log("💰 Creating Progress Invoices...");
    await prisma.progressInvoice.create({
        data: {
            project_id: project.id,
            company_id: companyId,
            invoice_no: "INV/NEOM/MAR/01",
            period_from: new Date("2024-03-01"),
            period_to: new Date("2024-03-31"),
            invoice_date: new Date(),
            contract_value: 1500000,
            this_period_pct: 10,
            this_period_amount: 150000,
            cumulative_pct: 10,
            cumulative_amount: 150000,
            retention_amount: 15000,
            net_payable: 135000,
            gross_payable: 155250,
            status: "submitted",
            created_by: manager.id
        }
    });

    console.log("✅ Week 6 Seed Complete! Your Execution Dashboard is now powered with real data.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
