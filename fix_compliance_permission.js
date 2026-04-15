"use strict";

// This script fixes the missing compliance dashboard permission for Department Heads and Project Managers
require('dotenv').config();
const prisma = require("./src/db");

async function fixPermissions() {
    console.log("🛠️  Applying RBAC Hotfix: Granting Compliance Dashboard access...");

    try {
        // 1. Find the permission
        const permission = await prisma.permission.findUnique({
            where: { code: "dashboard.compliance" }
        });

        if (!permission) {
            console.error("❌ Permission 'dashboard.compliance' not found in database.");
            return;
        }

        // 2. Find the roles
        const rolesToUpdate = ["department_head", "project_manager"];
        const roles = await prisma.role.findMany({
            where: { code: { in: rolesToUpdate } }
        });

        if (roles.length === 0) {
            console.error("❌ Roles 'department_head' or 'project_manager' not found.");
            return;
        }

        for (const role of roles) {
            // Check if association already exists
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
                console.log(`✅ Granted 'dashboard.compliance' to role: ${role.code}`);
            } else {
                console.log(`ℹ️  Role '${role.code}' already has 'dashboard.compliance'.`);
            }
        }

        console.log("🎉 Hotfix applied successfully.");
    } catch (error) {
        console.error("❌ Hotfix failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

fixPermissions();
