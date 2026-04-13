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
    console.log("🛠️ Running Hotfix: Execution Module RBAC...");

    // 1. Create the new permission if it doesn't exist
    const approvePerm = await prisma.permission.upsert({
        where: { code: "execution.approve" },
        update: {},
        create: {
            code: "execution.approve",
            module: "execution",
            description: "Final approval for variations, billing, and progress reports"
        }
    });

    const readPerm = await prisma.permission.upsert({
        where: { code: "execution.read" },
        update: {},
        create: {
            code: "execution.read",
            module: "execution",
            description: "View project execution, DPRs, and dashboards"
        }
    });

    const managePerm = await prisma.permission.upsert({
        where: { code: "execution.manage" },
        update: {},
        create: {
            code: "execution.manage",
            module: "execution",
            description: "Create and manage execution entries (DPR, HSE, Issues)"
        }
    });

    // 2. Identify Roles
    const roles = await prisma.role.findMany({
        where: { code: { in: ["site_engineer", "project_manager", "site_coordinator", "erp_admin"] } }
    });

    const roleMap = roles.reduce((acc, r) => ({ ...acc, [r.code]: r.id }), {});

    // 3. Map Permissions
    const mappings = [
        { role: "site_engineer", perms: ["execution.read", "execution.manage"] },
        { role: "site_coordinator", perms: ["execution.read", "execution.manage"] },
        { role: "project_manager", perms: ["execution.read", "execution.manage", "execution.approve"] },
        { role: "erp_admin", perms: ["execution.read", "execution.manage", "execution.approve"] },
    ];

    for (const m of mappings) {
        const roleId = roleMap[m.role];
        if (!roleId) continue;

        for (const pCode of m.perms) {
            const p = await prisma.permission.findUnique({ where: { code: pCode } });
            if (!p) continue;

            const exists = await prisma.rolePermission.findFirst({
                where: {
                    role_id: roleId,
                    permission_id: p.id
                }
            });

            if (!exists) {
                await prisma.rolePermission.create({
                    data: {
                        role_id: roleId,
                        permission_id: p.id
                    }
                });
            }
        }
    }

    console.log("✅ Execution RBAC Hotfix complete!");
}

main()
    .catch(err => console.error(err))
    .finally(() => prisma.$disconnect());
