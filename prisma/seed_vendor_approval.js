"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const prisma = require("../src/db");

async function main() {
    console.log("🚀 Seeding Vendor Approval Matrices...");

    // 1. Get ERP Admin Role
    const erpAdminRole = await prisma.role.findUnique({
        where: { code: "erp_admin" }
    });

    if (!erpAdminRole) {
        console.error("❌ erp_admin role not found. Please run seed_rbac.js first.");
        return;
    }

    // 2. Get all companies
    const companies = await prisma.company.findMany();

    for (const co of companies) {
        console.log(`📍 Configuring VENDOR matrix for company: ${co.name}`);
        
        // Clear existing
        await prisma.approvalMatrix.deleteMany({
            where: { 
                company_id: co.id, 
                doc_type: "VENDOR"
            }
        });

        // Add 1-step approval by ERP Admin
        await prisma.approvalMatrix.create({
            data: {
                company_id: co.id,
                doc_type: "VENDOR",
                role_id: erpAdminRole.id,
                step_order: 1,
                min_amount: 0,
                max_amount: 999999999 // Effectively no limit
            }
        });
    }

    console.log("✅ Vendor Approval Seeding Complete!");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
