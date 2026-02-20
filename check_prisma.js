const { Prisma } = require("@prisma/client");
const prisma = require("./src/db");

async function main() {
    console.log("Model names:", Object.keys(prisma));

    // Attempt to see what fields Prisma thinks exist
    // This is a bit hacky but Prisma.dmmf is sometimes available in dev
    // or we can just try to create with invalid data and catch the error to see the full list of available fields.
    try {
        await prisma.approvalRequest.create({
            data: {
                INVALID_FIELD_TO_TRIGGER_VALIDATION: "test"
            }
        });
    } catch (err) {
        console.log("Full validation error message:");
        console.log(err.message);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
