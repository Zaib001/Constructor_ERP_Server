"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🚀 Seeding Inventory Test Data (Issued POs)...");

    // 1. Find Company
    const company = await prisma.company.findFirst({
        where: { code: "ANT-CONS" }
    });
    if (!company) {
        throw new Error("Company ANT-CONS not found. Please run main seed first.");
    }

    // 2. Find internal User for created_by
    const admin = await prisma.user.findFirst({
        where: { company_id: company.id }
    });
    if (!admin) {
        throw new Error("No admin user found for company. Please run main seed first.");
    }

    // 3. Find Vendor
    const vendor = await prisma.vendor.findFirst({
        where: { company_id: company.id, status: "active" }
    });
    if (!vendor) {
        throw new Error("No active vendors found. Please run main seed first.");
    }

    // 4. Find Items
    const items = await prisma.item.findMany({
        where: { company_id: company.id },
        take: 5
    });
    if (items.length === 0) {
        throw new Error("No items found. Please run main seed first.");
    }

    // 5. Find Project and WBS for context (optional but good)
    const project = await prisma.project.findFirst({
        where: { company_id: company.id }
    });

    console.log(`📦 Creating 3 Issued POs for ${company.name}...`);

    const poData = [
        {
            po_number: "PO-2024-CEMENT-001",
            amount: 15000,
            status: "issued",
            delivery_status: "pending",
            vendor_id: vendor.id,
            company_id: company.id,
            project_id: project?.id,
            created_by: admin.id,
            items: {
                create: [
                    {
                        item_id: items.find(i => i.name.includes("Cement"))?.id || items[0].id,
                        item_name: "Portland Cement (Seeded)",
                        quantity: 300,
                        unit_price: 50,
                        total_price: 15000
                    }
                ]
            }
        },
        {
            po_number: "PO-2024-STEEL-002",
            amount: 45000,
            status: "issued",
            delivery_status: "pending",
            vendor_id: vendor.id,
            company_id: company.id,
            project_id: project?.id,
            created_by: admin.id,
            items: {
                create: [
                    {
                        item_id: items.find(i => i.name.includes("Steel"))?.id || items[1].id,
                        item_name: "Deformed Steel Bar (Seeded)",
                        quantity: 15,
                        unit_price: 3000,
                        total_price: 45000
                    }
                ]
            }
        },
        {
            po_number: "PO-2024-SAND-003",
            amount: 8000,
            status: "issued",
            delivery_status: "pending",
            vendor_id: vendor.id,
            company_id: company.id,
            project_id: project?.id,
            created_by: admin.id,
            items: {
                create: [
                    {
                        item_id: items.find(i => i.name.includes("Sand"))?.id || items[2].id,
                        item_name: "Sand River Washed (Seeded)",
                        quantity: 100,
                        unit_price: 80,
                        total_price: 8000
                    }
                ]
            }
        }
    ];

    for (const po of poData) {
        await prisma.purchaseOrder.create({
            data: po
        });
        console.log(`✅ Created ${po.po_number}`);
    }

    console.log("\n✨ Inventory Test Data Injection Complete!");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
