"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ 
    connectionString,
    max: 8,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🚀 Seeding Global Approval Matrices...");

    // 1. Get Roles
    const roles = await prisma.role.findMany();
    const roleMap = {};
    roles.forEach(r => roleMap[r.code] = r.id);

    if (!roleMap["project_manager"] || !roleMap["erp_admin"]) {
        console.error("❌ Required roles (project_manager, erp_admin) not found in DB. Run seed_rbac.js first.");
        return;
    }

    const matrixData = [
        // --- PR (Purchase Request) ---
        { doc_type: "PR", min_amount: 0, max_amount: 10000, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "PR", min_amount: 10001, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "PR", min_amount: 10001, max_amount: null, role_id: roleMap["erp_admin"], step_order: 2 },

        // --- PO (Purchase Order) ---
        { doc_type: "PO", min_amount: 0, max_amount: 50000, role_id: roleMap["erp_admin"], step_order: 1 },
        { doc_type: "PO", min_amount: 50001, max_amount: null, role_id: roleMap["erp_admin"], step_order: 1 },
        { doc_type: "PO", min_amount: 50001, max_amount: null, role_id: roleMap["super_admin"], step_order: 2 },

        // --- Expense ---
        { doc_type: "EXPENSE", min_amount: 0, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },

        // --- Quotation ---
        { doc_type: "QUOTATION", min_amount: 0, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "QUOTATION", min_amount: 0, max_amount: null, role_id: roleMap["erp_admin"], step_order: 2 },

        // --- Payroll ---
        { doc_type: "PAYROLL", min_amount: 0, max_amount: null, role_id: roleMap["erp_admin"], step_order: 1 }
    ];

    console.log(`🧹 Clearing existing matrices...`);
    await prisma.approvalMatrix.deleteMany();

    console.log(`📥 Inserting ${matrixData.length} global matrix rules...`);
    await prisma.approvalMatrix.createMany({ data: matrixData });

    console.log("✅ Approval Matrices seeded successfully!");
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
