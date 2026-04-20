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
    console.log("🛠️ Starting Accountant Permission Hotfix (Safe Mode)...");

    try {
        const role = await prisma.role.findUnique({ where: { code: "accounts_officer" } });
        const perm = await prisma.permission.findUnique({ where: { code: "item.read" } });

        if (!role || !perm) {
            console.error("❌ Role or Permission not found!");
            return;
        }

        // Check if exists
        const existing = await prisma.rolePermission.findFirst({
            where: { role_id: role.id, permission_id: perm.id }
        });

        if (!existing) {
            await prisma.rolePermission.create({
                data: { role_id: role.id, permission_id: perm.id }
            });
            console.log("✅ Permission 'item.read' granted to 'Accounts Officer'.");
        } else {
            console.log("ℹ️ Permission already exists.");
        }

    } catch (error) {
        console.error("❌ Hotfix failed:", error);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

hotfix();
whe