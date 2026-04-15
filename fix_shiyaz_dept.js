"use strict";

require('dotenv').config();
const prisma = require("./src/db");

async function fixShiyazDepartment() {
    console.log("🛠️  Fixing Department Link for 'shiyaz@erp.com'...");
    
    try {
        // 1. Find the user
        const user = await prisma.user.findFirst({
            where: { email: "shiyaz@erp.com" }
        });

        if (!user) {
            console.error("❌ User 'shiyaz@erp.com' not found.");
            return;
        }

        // 2. Find a suitable department (Civil Engineering or first available)
        const departments = await prisma.department.findMany();
        if (departments.length === 0) {
            console.error("❌ No departments found in the system. Please create a department first.");
            return;
        }

        const targetDept = departments.find(d => d.code === 'DEPT-CIV') || departments[0];
        console.log(`📍 Targeting Department: ${targetDept.name} (${targetDept.code})`);

        // 3. Update the user
        await prisma.user.update({
            where: { id: user.id },
            data: { department_id: targetDept.id }
        });

        console.log(`✅ Success! Shiyaz is now linked to ${targetDept.name}.`);
        
        // 4. Update Department Head relationship (optional but good for consistency)
        await prisma.department.update({
            where: { id: targetDept.id },
            data: { head_id: user.id }
        });
        console.log(`👑 Shiyaz is also officially set as the Head of ${targetDept.name}.`);

    } catch (error) {
        console.error("❌ Fix failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

fixShiyazDepartment();
