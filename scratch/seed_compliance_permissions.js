"use strict";

require("dotenv").config();
const prisma = require("../src/db");

async function seed() {
    console.log("Seeding Compliance, VAT & ZATCA permissions...");

    const permissions = [
        { code: "vat.read", description: "View monthly VAT return data and history" },
        { code: "vat.manage", description: "Submit manual VAT adjustments and lock periods" },
        { code: "zatca.read", description: "View ZATCA queue and event logs" },
        { code: "zatca.submit", description: "Initiate direct ZATCA e-invoicing clearance" },
        { code: "zatca.admin", description: "Onboard CSID credentials and trigger certificate rotations" }
    ];

    for (const perm of permissions) {
        await prisma.permission.upsert({
            where: { code: perm.code },
            update: {
                description: perm.description
            },
            create: {
                code: perm.code,
                description: perm.description,
                module: "finance"
            }
        });
        console.log(`  ✔ Permission '${perm.code}' seeded.`);
    }

    // Connect to Super Admin / Admin / Finance Manager roles
    const adminRoles = await prisma.role.findMany({
        where: { code: { in: ["super_admin", "admin", "finance_manager"] } }
    });

    for (const role of adminRoles) {
        for (const perm of permissions) {
            const dbPerm = await prisma.permission.findUnique({ where: { code: perm.code } });
            if (dbPerm) {
                const linkExists = await prisma.rolePermission.findFirst({
                    where: { role_id: role.id, permission_id: dbPerm.id }
                });

                if (!linkExists) {
                    await prisma.rolePermission.create({
                        data: {
                            role_id: role.id,
                            permission_id: dbPerm.id
                        }
                    });
                    console.log(`  ✔ Map: Role '${role.name}' -> Permission '${perm.code}'`);
                }
            }
        }
    }

    console.log("Permissions seeding completed successfully!");
}

seed()
    .catch(err => {
        console.error("Failed to seed permissions:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
