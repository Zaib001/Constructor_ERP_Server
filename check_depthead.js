"use strict";

require('dotenv').config();
const prisma = require("./src/db");

async function checkAllDeptHeads() {
    console.log("🔍 Inspecting ALL Department Head records...");
    
    try {
        const deptHeadRole = await prisma.role.findUnique({ where: { code: 'department_head' }});
        if (!deptHeadRole) {
            console.log("❌ Role 'department_head' not found.");
            return;
        }

        const users = await prisma.user.findMany({
            where: { role_id: deptHeadRole.id },
            include: { departments: true }
        });

        if (users.length === 0) {
            console.log("⚠️ No users found with the 'department_head' role.");
            
            const allUsers = await prisma.user.findMany({ 
                take: 10, 
                include: { roles: true }
            });
            console.log("\nSample of existing users:");
            allUsers.forEach(u => console.log(`- ${u.email} (${u.roles?.code || 'No Role'})`));
            return;
        }

        console.log(`Found ${users.length} Department Heads:`);
        users.forEach(u => {
            console.log(`- Name: ${u.name}`);
            console.log(`  Email: ${u.email}`);
            console.log(`  Dept ID: ${u.department_id || "MISSING"}`);
            console.log(`  Dept Name: ${u.departments?.name || "MISSING"}`);
            console.log("-------------------");
        });

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkAllDeptHeads();
