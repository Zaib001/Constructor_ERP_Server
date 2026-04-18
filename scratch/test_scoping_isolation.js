const { applyDataScope, MODULES } = require("../src/utils/scoping");

const mockUser = {
    id: "mock-id",
    roleCode: "hr_manager",
    companyId: "mock-company-id",
    isSuperAdmin: false
};

console.log("--- Test 1: Full Scope ---");
const scope1 = applyDataScope(mockUser, { module: MODULES.HR });
console.log(JSON.stringify(scope1, null, 2));

console.log("\n--- Test 2: noSoftDelete Scope ---");
const scope2 = applyDataScope(mockUser, { module: MODULES.HR, noSoftDelete: true });
console.log(JSON.stringify(scope2, null, 2));

process.exit(0);
