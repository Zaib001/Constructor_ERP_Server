"use strict";

require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    console.log("--- Seeding Vendor Permissions ---");

    // 1. Define required permissions
    const permissions = [
        { code: "vendor.read", module: "vendors", description: "View vendor directory and details" },
        { code: "vendor.create", module: "vendors", description: "Submit new vendor requests" },
        { code: "vendor.update", module: "vendors", description: "Update vendor information" },
        { code: "vendor.delete", module: "vendors", description: "Deactivate or remove vendors" }
    ];

    const createdPerms = {};
    for (const p of permissions) {
        createdPerms[p.code] = await prisma.permission.upsert({
            where: { code: p.code },
            update: { module: p.module, description: p.description },
            create: p
        });
        console.log(`✔ Permission: ${p.code}`);
    }

    // 2. Identify Roles
    const roles = await prisma.role.findMany({
        where: {
            code: { in: ["super_admin", "dept_head", "employee", "admin"] }
        }
    });

    console.log("\n--- Assigning Permissions to Roles ---");

    for (const role of roles) {
        let codesToAssign = [];
        const roleCode = role.code.toLowerCase();

        if (roleCode === "super_admin" || roleCode === "admin") {
            codesToAssign = ["vendor.read", "vendor.create", "vendor.update", "vendor.delete"];
        } else if (roleCode === "dept_head") {
            codesToAssign = ["vendor.read", "vendor.create"];
        } else if (roleCode === "employee") {
            codesToAssign = ["vendor.read", "vendor.create"];
        }

        console.log(`Role: ${role.code} -> Assigning: ${codesToAssign.join(", ")}`);

        for (const code of codesToAssign) {
            const perm = createdPerms[code];
            if (!perm) continue;

            // Check if link already exists
            const existing = await prisma.rolePermission.findFirst({
                where: {
                    role_id: role.id,
                    permission_id: perm.id
                }
            });

            if (!existing) {
                await prisma.rolePermission.create({
                    data: {
                        role_id: role.id,
                        permission_id: perm.id
                    }
                });
                console.log(`  + Linked ${code} to ${role.code}`);
            } else {
                console.log(`  . ${code} already linked to ${role.code}`);
            }
        }
    }

    console.log("\n✅ Vendor permissions seeded successfully!");
}

main()
    .catch(e => {
        console.error("Full error:", JSON.stringify(e, null, 2));
        if (e.cause) console.error("Cause:", JSON.stringify(e.cause, null, 2));
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
