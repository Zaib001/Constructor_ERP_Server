
require("dotenv").config();
const prisma = require("../src/db");
const employeesService = require("../src/modules/employees/employees.service");

async function test() {
    try {
        console.log("🧪 Testing deleteEmployee for Global HR...");
        
        // Find an employee in any company
        const emp = await prisma.employee.findFirst({ where: { is_active: true } });
        if (!emp) {
            console.log("No active employee found to test delete.");
            return;
        }
        
        console.log(`Found employee: ${emp.name} (Company ID: ${emp.company_id})`);

        // Mock a Global HR user with a DIFFERENT companyId (or no companyId)
        const globalHR = {
            id: "mock-id",
            roleCode: "hr_manager",
            isSuperAdmin: false,
            companyId: "00000000-0000-0000-0000-000000000000" // Different
        };
        
        console.log("Attempting to delete with mock Global HR...");
        await employeesService.deleteEmployee(emp.id, globalHR);
        console.log("✅ Success! Employee deleted.");
        
    } catch (err) {
        console.error("❌ Test failed:", err.message);
    }
}

test().catch(console.error).finally(() => prisma.$disconnect());
