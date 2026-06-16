require('dotenv').config();
const prisma = require('../src/db');
const employeesService = require('../src/modules/employees/employees.service');
const projectAccessService = require('../src/modules/projectAccess/projectAccess.service');
const departmentsService = require('../src/modules/departments/departments.service');
const companiesService = require('../src/modules/companies/companies.service');

async function main() {
    // Aliya Parveen context
    const user = {
        id: '2e2af615-5adf-4627-bf49-ccecc5d75914',
        name: 'Aliya Parveen',
        email: 'admin@magunified.com',
        roleCode: 'hr_manager',
        companyId: '89684f0e-1875-4240-8bb2-c88c911a8a60',
        isSuperAdmin: false
    };

    console.log("Using User Context:", user);

    console.log("\n1. Testing employeesService.getAllEmployees...");
    try {
        const res = await employeesService.getAllEmployees(user, null, null, 1, 10, 'active');
        console.log("✅ SUCCESS, employees count:", res.data.length);
    } catch (err) {
        console.error("❌ FAILED:", err);
    }

    console.log("\n2. Testing projectAccessService.getAllProjects...");
    try {
        const res = await projectAccessService.getAllProjects(user);
        console.log("✅ SUCCESS, projects count:", res.length);
    } catch (err) {
        console.error("❌ FAILED:", err);
    }

    console.log("\n3. Testing departmentsService.getAll...");
    try {
        const res = await departmentsService.getAll(user);
        console.log("✅ SUCCESS, departments count:", res.length);
    } catch (err) {
        console.error("❌ FAILED:", err);
    }

    console.log("\n4. Testing companiesService.getAll...");
    try {
        const res = await companiesService.getAll(user, { page: 1, limit: 100 });
        console.log("✅ SUCCESS, companies count:", res.data?.length || res.length);
    } catch (err) {
        console.error("❌ FAILED:", err);
    }

    await prisma.$disconnect();
}

main();
