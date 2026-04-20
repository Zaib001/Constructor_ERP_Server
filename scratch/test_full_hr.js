
require("dotenv").config();
const prisma = require("../src/db");
const employeesService = require("../src/modules/employees/employees.service");

async function test() {
    try {
        console.log("🧪 Testing Comprehensive HR Operations for Global HR...");
        
        // Mock a Global HR user
        const globalHR = {
            id: "mock-id",
            roleCode: "hr_manager",
            isSuperAdmin: false,
            companyId: "77777777-7777-7777-7777-777777777777" // Mock primary company
        };

        // 1. Find a target company that is NOT the HR's company
        const otherCompany = await prisma.company.findFirst({
            where: { id: { not: globalHR.companyId }, is_active: true }
        });
        
        if (!otherCompany) {
            console.log("Only one company found, creating test company...");
            // Skip for now or just use the same company if only one exists
        }
        
        const targetId = otherCompany ? otherCompany.id : globalHR.companyId;
        console.log(`Target Company: ${otherCompany ? otherCompany.name : 'Same Company'}`);

        // 2. Create Employee
        console.log("Step 1: Creating employee in target company...");
        const newEmp = await employeesService.createEmployee({
            name: "Scoping Test User " + Date.now(),
            company_id: targetId,
            iqama_no: "TEST-" + Math.random().toString(36).substring(7),
            joining_date: new Date()
        }, globalHR);
        console.log(`✅ Create Success! Employee ID: ${newEmp.id}, Company ID: ${newEmp.company_id}`);

        // 3. Update Employee
        console.log("Step 2: Updating employee...");
        await employeesService.updateEmployee(newEmp.id, {
            ...newEmp,
            designation: "Verified Global Manager Access"
        }, globalHR);
        console.log("✅ Update Success!");

        // 4. Delete Employee
        console.log("Step 3: Deleting employee...");
        await employeesService.deleteEmployee(newEmp.id, globalHR);
        console.log("✅ Delete Success!");

        console.log("\n🚀 All operations completed successfully!");
        
    } catch (err) {
        console.error("❌ Operation failed:", err.message);
        if (err.stack) console.error(err.stack);
    }
}

test().catch(console.error).finally(() => prisma.$disconnect());
