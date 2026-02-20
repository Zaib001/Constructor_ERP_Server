require("dotenv").config();
const prisma = require("./db");

async function debug() {
    try {
        console.log("--- DEBUG: Approvals Data ---");

        const roles = await prisma.role.findMany();
        console.log(`\nTotal Roles: ${roles.length}`);
        roles.forEach(r => console.log(`Role: ${r.name} | Code: ${r.code} | ID: ${r.id}`));

        const users = await prisma.user.findMany({
            where: { deleted_at: null },
            include: { roles: true }
        });
        console.log(`Total Users: ${users.length}`);
        users.forEach(u => console.log(`User: ${u.email} | Role: ${u.roles?.code} | ID: ${u.id}`));

        const projects = await prisma.project.findMany();
        console.log(`\nTotal Projects: ${projects.length}`);
        projects.forEach(p => console.log(`Project: ${p.name} | ID: ${p.id}`));

        const matrices = await prisma.approvalMatrix.findMany({
            include: { roles: true }
        });
        console.log(`\nApproval Matrices: ${matrices.length}`);

        const requests = await prisma.approvalRequest.findMany({
            include: { approval_steps: true }
        });
        console.log(`\nApproval Requests: ${requests.length}`);

        requests.forEach(r => {
            console.log(`Req: ${r.doc_type} ${r.doc_id} | Status: ${r.current_status} | Step: ${r.current_step}/${r.total_steps}`);
            r.approval_steps.forEach(s => {
                console.log(`  Step: ${s.step_order} | RoleID: ${s.role_id} | UserID: ${s.approver_user} | Status: ${s.status}`);
            });
        });

        const assignments = await prisma.userProject.findMany({
            where: { revoked_at: null }
        });
        console.log(`\nUser-Project Assignments: ${assignments.length}`);
        assignments.forEach(a => console.log(`User: ${a.user_id} | Project: ${a.project_id}`));

    } catch (err) {
        console.error("Debug failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
