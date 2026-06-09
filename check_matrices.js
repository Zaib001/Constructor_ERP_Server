require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("--- DIAGNOSTIC: Target Project ---");
    const projId = "a31af65b-e1a6-4ac9-8610-073c9d7e2753";
    const project = await prisma.project.findUnique({
        where: { id: projId },
        include: { company: true }
    });
    if (project) {
        console.log(`Project: ${project.name} (${project.id})`);
        console.log(`Company: ${project.company?.name} (${project.company_id})`);
        console.log(`Company details: is_active = ${project.company?.is_active}, deleted_at = ${project.company?.deleted_at}`);
    } else {
        console.log(`Project with ID ${projId} NOT found!`);
    }

    console.log("\n--- DIAGNOSTIC: Site Engineers ---");
    const users = await prisma.user.findMany({
        where: { roles: { code: "site_engineer" } },
        include: { roles: true }
    });
    users.forEach(u => {
        console.log(`User: ${u.email} [${u.id}] Co: ${u.company_id} Role: ${u.roles?.code}`);
    });

    console.log("\n--- DIAGNOSTIC: DPR Matrices ---");
    const matrices = await prisma.approvalMatrix.findMany({
        where: { doc_type: "DPR" },
        include: {
            roles: true,
            projects: true
        },
        orderBy: [
            { step_order: 'asc' }
        ]
    });

    matrices.forEach(m => {
        console.log(`DocType: ${m.doc_type} | Step: ${m.step_order} | Role: ${m.roles?.code} | Min: ${m.min_amount} | Max: ${m.max_amount} | Project: ${m.projects?.name || 'Global'} | Co: ${m.company_id}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
