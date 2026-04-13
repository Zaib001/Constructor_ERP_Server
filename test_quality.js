require('dotenv').config();
const prisma = require('./src/db');
const { createITPPlan, createInspection, createNCR, getProjectQualitySummary } = require('./src/modules/quality/quality.service');

async function testQuality() {
    console.log("Starting Quality Models Test...");

    const user = await prisma.user.findFirst();
    const wbs = await prisma.wBS.findFirst();
    if (!wbs) return console.log("No WBS found to attach quality metrics.");
    
    const project = await prisma.project.findUnique({ where: { id: wbs.project_id } });

    if (!user || !project || !wbs) {
        console.error("Missing initial seed data (User, Project, WBS).");
        return;
    }

    try {
        // 1. Create ITP Plan
        console.log("Creating ITP Plan...");
        const itp = await createITPPlan({
            project_id: project.id,
            wbs_id: wbs.id,
            itp_no: `ITP-TEST-${Date.now().toString().slice(-4)}`,
            title: "Test Inspection Plan",
            description: "Automated test plan",
            is_v_critical: true,
            blocking_enabled: true
        }, user.id, user.company_id);
        console.log("ITP created:", itp.id);

        // 2. Create Inspection (Pending)
        console.log("Creating Inspection...");
        const insp = await createInspection({
            project_id: project.id,
            wbs_id: wbs.id,
            itp_plan_id: itp.id,
            insp_no: `IR-TEST-${Date.now().toString().slice(-4)}`,
            inspection_type: 'ITP',
            activity: 'Test Pouring',
            location: 'Grid A',
            scheduled_date: new Date()
        }, user.id, user.company_id);
        console.log("Inspection created:", insp.id);

        // 3. Create NCR (Open)
        console.log("Creating NCR...");
        const ncr = await createNCR({
            project_id: project.id,
            wbs_id: wbs.id,
            ncr_no: `NCR-TEST-${Date.now().toString().slice(-4)}`,
            title: "Test Defect",
            description: "Some concrete defect",
            category: "WORKMANSHIP",
            severity: "MAJOR"
        }, user.id, user.company_id);
        console.log("NCR created:", ncr.id);

        // 4. Fetch Summary to see if logic handles it
        console.log("Fetching Summary...");
        const summary = await getProjectQualitySummary(project.id, user.company_id);
        console.log("Summary fetched successfully:");
        console.log("Pending Actions:", summary.pending_actions.length);
        console.log("NCR Data Nodes:", summary.ncrData.length);
        console.log("Trend Data Nodes:", summary.trendData.length);

        console.log("All Quality Models are perfectly working.");

    } catch (err) {
        console.error("Error testing models:", err);
    } finally {
        await prisma.$disconnect();
    }
}

testQuality();
