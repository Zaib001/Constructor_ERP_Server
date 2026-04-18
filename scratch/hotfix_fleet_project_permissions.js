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
    console.log("🛠️ Starting Fleet & Accountant Project Permission Hotfix...");

    try {
        const rolesToUpdate = ["fleet_coordinator", "accounts_officer"];
        const projectReadPerm = await prisma.permission.findUnique({ where: { code: "project.read" } });

        if (!projectReadPerm) {
            console.error("❌ Permission 'project.read' not found!");
            return;
        }

        for (const roleCode of rolesToUpdate) {
            const role = await prisma.role.findUnique({ where: { code: roleCode } });
            if (!role) {
                console.warn(`⚠️ Role '${roleCode}' not found.`);
                continue;
            }

            const existing = await prisma.rolePermission.findFirst({
                where: { role_id: role.id, permission_id: projectReadPerm.id }
            });

            if (!existing) {
                await prisma.rolePermission.create({
                    data: { role_id: role.id, permission_id: projectReadPerm.id }
                });
                console.log(`✅ 'project.read' granted to '${role.name}'.`);
            } else {
                console.log(`ℹ️ '${role.name}' already has project read access.`);
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
