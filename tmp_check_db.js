const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    console.log("--- DIANOSTIC: Approval Requests & Departments ---");
    const requests = await prisma.approvalRequest.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
            departments: true,
            projects: true
        }
    });

    requests.forEach(r => {
        console.log(`ID: ${r.id}`);
        console.log(`Doc: ${r.doc_type} - ${r.doc_id}`);
        console.log(`Dept ID Scalar: ${r.department_id}`);
        console.log(`Dept Relation: ${r.departments ? r.departments.name : "NULL"}`);
        console.log(`Project: ${r.projects ? r.projects.name : "Global"}`);
        console.log("---");
    });

    const userCount = await prisma.user.count({ where: { department_id: null } });
    console.log(`Users without department: ${userCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
