require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("--- DIANOSTIC: Approval Matrices ---");
    const matrices = await prisma.approvalMatrix.findMany({
        include: {
            roles: true,
            departments: true,
            projects: true
        },
        orderBy: [
            { doc_type: 'asc' },
            { step_order: 'asc' }
        ]
    });

    matrices.forEach(m => {
        console.log(`ID: ${m.id}`);
        console.log(`DocType: ${m.doc_type}`);
        console.log(`Step: ${m.step_order}`);
        console.log(`Role: ${m.roles ? m.roles.code : 'NULL'}`);
        console.log(`Dept: ${m.departments ? m.departments.name : 'NULL'}`);
        console.log(`Project: ${m.projects ? m.projects.name : 'Global'}`);
        console.log(`Min: ${m.min_amount} | Max: ${m.max_amount}`);
        console.log("---");
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
