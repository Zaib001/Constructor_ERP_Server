
require("dotenv").config();
const prisma = require("../src/db");
const companiesService = require("../src/modules/companies/companies.service");

async function test() {
    try {
        console.log("🧪 Testing getAllCompanies for Global HR...");
        
        // Mock a Global HR user
        const globalHR = {
            id: "mock-id",
            roleCode: "hr_manager",
            isSuperAdmin: false,
            companyId: null // Global managers might not have a primary companyId
        };
        
        const result = await companiesService.getAllCompanies(globalHR);
        console.log("✅ Success! Found companies:", result.data.length);
        console.log("Sample company:", result.data[0]?.name);
        
    } catch (err) {
        console.error("❌ Test failed:", err.message);
    }
}

test().catch(console.error).finally(() => prisma.$disconnect());
