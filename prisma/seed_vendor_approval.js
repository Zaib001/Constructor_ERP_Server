"use strict";

require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    console.log("--- Starting Vendor Approval Matrix Seed ---");

    // 1. Find the necessary roles
    const deptHeadRole = await prisma.role.findFirst({
        where: { code: "dept_head" }
    });

    const superAdminRole = await prisma.role.findFirst({
        where: { code: "super_admin" }
    });

    if (!deptHeadRole || !superAdminRole) {
        console.error("Critical roles missing. Please ensure DEPT_HEAD and SUPER_ADMIN roles exist.");
        process.exit(1);
    }

    console.log(`Found roles: DEPT_HEAD (${deptHeadRole.id}), SUPER_ADMIN (${superAdminRole.id})`);

    // 2. Clear existing VENDOR matrices to avoid duplicates during development
    await prisma.approvalMatrix.deleteMany({
        where: { doc_type: "VENDOR" }
    });

    // 3. Create Global Vendor Approval Matrix (Project independent, Department based)
    // Step 1: Department Head Review
    await prisma.approvalMatrix.create({
        data: {
            doc_type: "VENDOR",
            step_order: 1,
            role_id: deptHeadRole.id,
            is_parallel: false,
            is_mandatory: true,
            min_amount: 0,
            max_amount: 999999999, // Effectively all vendor requests
        }
    });

    // Step 2: Superadmin Final Approval
    await prisma.approvalMatrix.create({
        data: {
            doc_type: "VENDOR",
            step_order: 2,
            role_id: superAdminRole.id,
            is_parallel: false,
            is_mandatory: true,
            min_amount: 0,
            max_amount: 999999999,
        }
    });

    console.log("✅ Vendor Approval Matrix configured successfully (Dept Head -> Superadmin)");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
