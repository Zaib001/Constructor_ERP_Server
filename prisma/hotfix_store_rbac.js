"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({
    connectionString,
    max: 1,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function hotfix() {
    console.log("🛠️ Starting Store Permission Hotfix...");

    try {
        // 1. Ensure Permission exists
        const permission = await prisma.permission.upsert({
            where: { code: 'inventory.store.manage' },
            update: {},
            create: {
                code: 'inventory.store.manage',
                module: 'inventory',
                description: 'Create and manage warehouses/stores'
            }
        });
        console.log(`✅ Permission verified: ${permission.code}`);

        // 2. Identify target roles
        const targetRoles = ['super_admin', 'erp_admin'];
        const roles = await prisma.role.findMany({
            where: { code: { in: targetRoles } }
        });

        for (const role of roles) {
            // Check if mapping already exists
            const existing = await prisma.rolePermission.findFirst({
                where: {
                    role_id: role.id,
                    permission_id: permission.id
                }
            });

            if (!existing) {
                await prisma.rolePermission.create({
                    data: {
                        role_id: role.id,
                        permission_id: permission.id
                    }
                });
                console.log(`🔗 Assigned permission to role: ${role.code}`);
            } else {
                console.log(`ℹ️ Role ${role.code} already has the permission.`);
            }
        }

        console.log("🎉 Hotfix complete!");
    } catch (error) {
        console.error("❌ Hotfix failed:", error);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

hotfix();
