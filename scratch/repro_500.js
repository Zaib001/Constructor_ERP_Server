const prisma = require("../src/db");
const { getWorkspaceSummary } = require("../src/modules/dashboard/dashboard.service");
const { getStockSnapshot } = require("../src/modules/inventory/inventory.service");

async function test() {
    console.log("--- Testing Dashboard ---");
    const hrManager = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        roleCode: "hr_manager",
        companyId: "123e4567-e89b-12d3-a456-426614174000",
        isSuperAdmin: false
    };

    try {
        await getWorkspaceSummary(hrManager);
        console.log("Dashboard: Success");
    } catch (err) {
        console.error("Dashboard: Failed", err);
    }

    console.log("\n--- Testing Accounts ---");
    const accountManager = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        roleCode: "accounts_manager",
        companyId: "64795e0b-0073-45d6-a77a-83f40a58845b",
        isSuperAdmin: false
    };

    try {
        await getWorkspaceSummary(accountManager);
        console.log("Accounts: Success");
    } catch (err) {
        console.error("Accounts: Failed", err);
    }

    console.log("\n--- Testing Inventory ---");
    const procManager = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        roleCode: "procurement_manager",
        companyId: "123e4567-e89b-12d3-a456-426614174000",
        isSuperAdmin: false
    };

    try {
        await getStockSnapshot(procManager);
        console.log("Inventory: Success");
    } catch (err) {
        console.error("Inventory: Failed", err);
    }

    process.exit(0);
}

test();
