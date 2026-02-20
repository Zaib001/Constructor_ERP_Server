const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    console.log("--- Approval Requests ---");
    const requests = await prisma.approvalRequest.findMany({
        include: { approval_steps: true }
    });
    console.dir(requests, { depth: null });

    console.log("\n--- Approval Steps (Pending) ---");
    const pendingSteps = await prisma.approvalStep.findMany({
        where: { status: "pending" }
    });
    console.dir(pendingSteps, { depth: null });
}

main().finally(() => prisma.$disconnect());
