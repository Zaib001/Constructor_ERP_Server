require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("--- DIAGNOSTIC START ---");

    // Check some requests
    const requests = await prisma.approvalRequest.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
            departments: true,
            projects: true
        }
    });

    console.log(`Found ${requests.length} recent requests.`);
    requests.forEach(r => {
        console.log(`[Request ${r.id.slice(0, 8)}] Doc: ${r.doc_type} | DeptID: ${r.department_id} | DeptRelation: ${r.departments?.name || "MISSING"}`);
    });

    // Check users
    const users = await prisma.user.findMany({
        take: 5,
        where: { deleted_at: null },
        include: { departments: true }
    });
    console.log("\nRecent Users:");
    users.forEach(u => {
        console.log(`[User ${u.id.slice(0, 8)}] Name: ${u.name} | DeptID: ${u.department_id} | DeptName: ${u.departments?.name || "NONE"}`);
    });

    // Check departments
    const depts = await prisma.department.findMany();
    console.log(`\nTotal Departments in DB: ${depts.length}`);
    depts.forEach(d => console.log(`- ${d.name} (${d.id})`));

    console.log("--- DIAGNOSTIC END ---");
}

main().catch(console.error).finally(() => prisma.$disconnect());
