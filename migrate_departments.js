require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("--- DATA MIGRATION: Populating missing Department IDs ---");

    // Find requests with null department_id
    const requests = await prisma.approvalRequest.findMany({
        where: { department_id: null },
        select: { id: true, requested_by: true }
    });

    console.log(`Found ${requests.length} requests needing update.`);

    let updatedCount = 0;
    for (const r of requests) {
        if (!r.requested_by) continue;

        const user = await prisma.user.findUnique({
            where: { id: r.requested_by },
            select: { department_id: true }
        });

        if (user && user.department_id) {
            await prisma.approvalRequest.update({
                where: { id: r.id },
                data: { department_id: user.department_id }
            });
            updatedCount++;
        }
    }

    console.log(`Successfully updated ${updatedCount} requests.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
