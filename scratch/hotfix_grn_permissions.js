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
    console.log("🛠️ Starting GRN Permission Hotfix...");

    try {
        const accountantRole = await prisma.role.findUnique({ where: { code: "accounts_officer" } });
        const hrRole = await prisma.role.findUnique({ where: { code: "hr_admin" } });
        const grnPerm = await prisma.permission.findUnique({ where: { code: "inventory.grn.create" } });

        if (!grnPerm) {
            console.error("❌ Permission 'inventory.grn.create' not found!");
            return;
        }

        const rolesToUpdate = [accountantRole, hrRole].filter(Boolean);

        for (const role of rolesToUpdate) {
            const existing = await prisma.rolePermission.findFirst({
                where: { role_id: role.id, permission_id: grnPerm.id }
            });

            if (!existing) {
                await prisma.rolePermission.create({
                    data: { role_id: role.id, permission_id: grnPerm.id }
                });
                console.log(`✅ GRN creation granted to '${role.name}'.`);
            } else {
                console.log(`ℹ️ '${role.name}' already has GRN access.`);
            }
        }

    } catch (error) {
        console.error("❌ Hotfix failed:", error);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

hotfix();
