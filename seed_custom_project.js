require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("🌱 Creating a new custom project, WBS structure, and assigning it to the site engineer...");

    // Core variables (from existing DB query)
    const companyId = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6"; // Antigravity Construction
    const engineerId = "73fb4499-9646-4bee-9090-889985455886"; // Sara Engineer (engineer@erp.com)
    const pmId = "c2d8051d-639d-4a67-8fd3-1511d8f7c605"; // Ahmed Manager (pm@erp.com)

    // 1. Create a brand new project
    const projectCode = `PRJ-SKYLINE-${Math.floor(Math.random() * 1000)}`;
    const project = await prisma.project.create({
        data: {
            code: projectCode,
            name: "Skyline Premium Tower Phase 1",
            status: "active",
            company_id: companyId,
            description: "A luxury multi-story tower project for testing DPR, WBS, and progress flows.",
            budget: 5000000,
            revenue: 6500000,
            cost: 0
        }
    });
    console.log(`✅ Created Project: ${project.name} (${project.code}) [ID: ${project.id}]`);

    // 2. Create a WBS structure
    // Root Node 1
    const wbsMob = await prisma.wBS.create({
        data: {
            project_id: project.id,
            wbs_code: "1.0",
            name: "Site Mobilization & Fencing",
            planned_qty: 1,
            unit: "LS",
            weight_pct: 20
        }
    });
    console.log(`✅ Created WBS: ${wbsMob.name} (${wbsMob.wbs_code}) [ID: ${wbsMob.id}]`);

    // Root Node 2
    const wbsSub = await prisma.wBS.create({
        data: {
            project_id: project.id,
            wbs_code: "2.0",
            name: "Substructure & Excavation",
            weight_pct: 80
        }
    });
    console.log(`✅ Created WBS: ${wbsSub.name} (${wbsSub.wbs_code}) [ID: ${wbsSub.id}]`);

    // Leaf Node under Node 2
    const wbsExc = await prisma.wBS.create({
        data: {
            project_id: project.id,
            parent_id: wbsSub.id,
            wbs_code: "2.1",
            name: "Mass Excavation Sector A",
            planned_qty: 1000,
            unit: "M3",
            weight_pct: 35
        }
    });
    console.log(`✅ Created WBS: ${wbsExc.name} (${wbsExc.wbs_code}) [ID: ${wbsExc.id}]`);

    // 3. Create a BOQ (Bill of Quantities) Item for the leaf WBS activity
    const boqItem = await prisma.bOQItem.create({
        data: {
            company_id: companyId,
            project_id: project.id,
            wbs_id: wbsExc.id,
            item_code: "BOQ-EXC-01",
            description: "Excavation in soft/medium soil with disposal",
            unit: "M3",
            planned_qty: 1000,
            unit_rate: 150,
            total_amount: 150000,
            created_by: pmId
        }
    });
    console.log(`✅ Created BOQ Item: ${boqItem.description} [ID: ${boqItem.id}]`);

    // 4. Assign both Site Engineer and PM to the new project
    const assignmentEng = await prisma.userProject.create({
        data: {
            user_id: engineerId,
            project_id: project.id,
            access_type: "site_engineer"
        }
    });
    const assignmentPm = await prisma.userProject.create({
        data: {
            user_id: pmId,
            project_id: project.id,
            access_type: "project_manager"
        }
    });
    console.log(`✅ Assigned Site Engineer (Sara) to Project. [Assignment ID: ${assignmentEng.id}]`);
    console.log(`✅ Assigned Project Manager (Ahmed) to Project. [Assignment ID: ${assignmentPm.id}]`);

    console.log("\n🚀 Project successfully set up!");
    console.log("--------------------------------------------------------------------------------");
    console.log(`PROJECT ID:    "${project.id}"`);
    console.log(`COMPANY ID:    "${companyId}"`);
    console.log(`SITE ENG ID:   "${engineerId}"`);
    console.log(`PM ID:         "${pmId}"`);
    console.log(`WBS MOB ID:    "${wbsMob.id}" (Site Mobilization & Fencing)`);
    console.log(`WBS EXC ID:    "${wbsExc.id}" (Mass Excavation Sector A - Activity Node)`);
    console.log(`BOQ ITEM ID:   "${boqItem.id}"`);
    console.log("--------------------------------------------------------------------------------");
}

main()
    .catch(e => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
