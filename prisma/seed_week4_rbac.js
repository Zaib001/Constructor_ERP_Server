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
    console.log("🚀 Starting Week 4 RBAC Selective Seeding...");

    // 1. Fetch Existing Roles
    console.log("🔍 Fetching existing roles...");
    const existingRoles = await prisma.role.findMany();
    const roleMap = {};
    for (const r of existingRoles) {
        roleMap[r.code] = r.id;
    }

    // Role mapping based on instructions
    const neededRoles = [
        "super_admin", "erp_admin", "project_manager", 
        "site_engineer", "procurement_officer", "accounts_officer",
        "storekeeper", "hr_admin"
    ];

    for (const needed of neededRoles) {
        if (!roleMap[needed]) {
            console.log(`⚠️ Role '${needed}' not found. Creating it...`);
            const friendlyName = needed.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const newRole = await prisma.role.create({
                data: {
                    code: needed,
                    name: friendlyName,
                    is_system_role: ["super_admin", "erp_admin"].includes(needed)
                }
            });
            roleMap[needed] = newRole.id;
            console.log(`✅ Created role '${needed}'`);
        }
    }

    // 2. Define Week 4 Permissions
    console.log("🔐 Upserting Permissions...");
    const permissionsToSeed = [
        // PR
        { code: "procurement.pr.read", module: "procurement", description: "Read Purchase Requisitions" },
        { code: "procurement.pr.create", module: "procurement", description: "Create Purchase Requisitions" },
        { code: "procurement.pr.update", module: "procurement", description: "Update Purchase Requisitions" },
        { code: "procurement.pr.submit", module: "procurement", description: "Submit Purchase Requisitions" },
        { code: "procurement.pr.approve", module: "procurement", description: "Approve Purchase Requisitions" },
        // RFQ
        { code: "procurement.rfq.read", module: "procurement", description: "Read RFQs" },
        { code: "procurement.rfq.create", module: "procurement", description: "Create RFQs" },
        { code: "procurement.rfq.update", module: "procurement", description: "Update RFQs" },
        { code: "procurement.rfq.issue", module: "procurement", description: "Issue RFQs" },
        // Quote
        { code: "procurement.quote.read", module: "procurement", description: "Read Vendor Quotes" },
        { code: "procurement.quote.create", module: "procurement", description: "Enter Vendor Quotes" },
        { code: "procurement.quote.update", module: "procurement", description: "Update Vendor Quotes" },
        // Comparison
        { code: "procurement.comparison.read", module: "procurement", description: "Read Vendor Comparison" },
        { code: "procurement.comparison.run", module: "procurement", description: "Run Quotes Comparison" },
        { code: "procurement.vendor.select", module: "procurement", description: "Select Winning Vendor" },
        // PO
        { code: "procurement.po.read", module: "procurement", description: "Read Purchase Orders" },
        { code: "procurement.po.create", module: "procurement", description: "Draft Purchase Orders" },
        { code: "procurement.po.update", module: "procurement", description: "Update Purchase Orders" },
        { code: "procurement.po.approve", module: "procurement", description: "Approve Purchase Orders" },
        { code: "procurement.po.issue", module: "procurement", description: "Issue Purchase Orders" },
        // Petty Cash
        { code: "pettycash.read", module: "pettycash", description: "Read Petty Cash Requests" },
        { code: "pettycash.create", module: "pettycash", description: "Create Petty Cash Requests" },
        { code: "pettycash.approve", module: "pettycash", description: "Approve Petty Cash Requests" },
        { code: "pettycash.expense.create", module: "pettycash", description: "Submit Petty Cash Expense" },
        { code: "pettycash.expense.verify", module: "pettycash", description: "Verify Petty Cash Expense" },
        // Petrol
        { code: "petrol.read", module: "petrol", description: "Read Petrol Expenses" },
        { code: "petrol.create", module: "petrol", description: "Create Petrol Expenses" },
        { code: "petrol.verify", module: "petrol", description: "Verify Petrol Expenses" },
        // Vendor Master
        { code: "vendor.read", module: "vendors", description: "Read Vendors" },
        { code: "vendor.create", module: "vendors", description: "Create Vendors" },
        { code: "vendor.update", module: "vendors", description: "Update Vendors" },
        { code: "vendor.approve", module: "vendors", description: "Approve Vendors" }
    ];

    const permMap = {};
    for (const p of permissionsToSeed) {
        const stored = await prisma.permission.upsert({
            where: { code: p.code },
            update: { description: p.description, module: p.module },
            create: p
        });
        permMap[p.code] = stored.id;
    }
    console.log("✅ Permissions upserted.");

    // 3. Define the Role-To-Permission Matrix
    console.log("🔗 Mapping permissions to roles...");
    
    const rolePermissionsMatrix = {
        super_admin: permissionsToSeed.map(p => p.code),
        erp_admin: permissionsToSeed.map(p => p.code),
        project_manager: [
            "procurement.pr.read", "procurement.pr.create", "procurement.pr.update", "procurement.pr.submit", "procurement.pr.approve",
            "procurement.rfq.read", "procurement.quote.read", "procurement.comparison.read",
            "procurement.po.read", "procurement.po.approve",
            "pettycash.read", "pettycash.create", "pettycash.approve",
            "petrol.read", "petrol.create"
        ],
        site_engineer: [
            "procurement.pr.read", "procurement.pr.create", "procurement.pr.update", "procurement.pr.submit",
            "pettycash.read", "pettycash.create", "pettycash.expense.create",
            "petrol.read", "petrol.create"
        ],
        procurement_officer: [
            "procurement.pr.read", "procurement.rfq.read", "procurement.rfq.create", "procurement.rfq.update", "procurement.rfq.issue",
            "procurement.quote.read", "procurement.quote.create", "procurement.quote.update",
            "procurement.comparison.read", "procurement.comparison.run", "procurement.vendor.select",
            "procurement.po.read", "procurement.po.create", "procurement.po.update",
            "vendor.read", "vendor.create", "vendor.update"
        ],
        accounts_officer: [
            "procurement.pr.read", "procurement.rfq.read", "procurement.quote.read", "procurement.comparison.read", "procurement.po.read",
            "pettycash.read", "pettycash.expense.verify",
            "petrol.read", "petrol.verify"
        ]
    };

    let mappingsAdded = 0;
    for (const [roleCode, permCodes] of Object.entries(rolePermissionsMatrix)) {
        const roleId = roleMap[roleCode];
        if (!roleId) continue; // Skip if role wasn't created/found

        for (const pCode of permCodes) {
            const permId = permMap[pCode];
            
            // Upsert mapping so we don't duplicate
            // Prisma doesn't have a simple upsert for many-to-many junction tables without an ID if the compound isn't a unique constraint,
            // let's check if it exists:
            const existing = await prisma.rolePermission.findFirst({
                where: { role_id: roleId, permission_id: permId }
            });

            if (!existing) {
                await prisma.rolePermission.create({
                    data: { role_id: roleId, permission_id: permId }
                });
                mappingsAdded++;
            }
        }
    }

    console.log(`✅ successfully added ${mappingsAdded} new role-permission mappings.`);
    console.log("🎉 Week 4 RBAC Seeding Complete!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
