/**
 * TEST SCRIPT: Manager Horizons Scoping Logic
 * This script validates that the applyDataScope function correctly enforces
 * global read horizons for managers and tenant isolation for all mutations.
 */

const { applyDataScope, MODULES } = require("../src/utils/scoping");

// 1. MOCK USERS
const testUsers = {
    superAdmin: { id: "u1", roleCode: "super_admin", isSuperAdmin: true, companyId: "co_main" },
    hrManager: { id: "u2", roleCode: "hr_manager", isSuperAdmin: false, companyId: "co_main" },
    salesManager: { id: "u3", roleCode: "sales_manager", isSuperAdmin: false, companyId: "co_main" },
    erpAdmin: { id: "u4", roleCode: "erp_admin", isSuperAdmin: false, companyId: "co_main" },
    hrOfficer: { id: "u5", roleCode: "hr_admin", isSuperAdmin: false, companyId: "co_main" }
};

const results = [];

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        results.push({ status: "FAIL", message });
    } else {
        console.log(`✅ PASSED: ${message}`);
        results.push({ status: "PASS", message });
    }
}

console.log("🚀 Starting Manager Horizons Security Audit...\n");

// --- TEST CASE 1: Super Admin Global Access ---
const saScope = applyDataScope(testUsers.superAdmin, { module: MODULES.HR, isWrite: false });
assert(Object.keys(saScope).length === 1 && saScope.deleted_at === null, "Super Admin sees everything globally (no company filter)");

// --- TEST CASE 2: HR Manager reading HR records (Inside Horizon) ---
const hrManagerReadHR = applyDataScope(testUsers.hrManager, { module: MODULES.HR, isWrite: false });
assert(!hrManagerReadHR.company_id, "HR Manager gets Global READ access within HR horizon");

// --- TEST CASE 3: HR Manager writing HR records (IsWrite: True) ---
const hrManagerWriteHR = applyDataScope(testUsers.hrManager, { module: MODULES.HR, isWrite: true });
assert(hrManagerWriteHR.company_id === "co_main", "HR Manager is restricted to Home Company for HR WRITES");

// --- TEST CASE 4: HR Manager reading Sales records (Outside Horizon) ---
const hrManagerReadSales = applyDataScope(testUsers.hrManager, { module: MODULES.SALES, isWrite: false });
assert(hrManagerReadSales.company_id === "co_main", "HR Manager restricted to Home Company when reading outside their horizon");

// --- TEST CASE 5: ERP Admin reading HR records ---
const erpAdminReadHR = applyDataScope(testUsers.erpAdmin, { module: MODULES.HR, isWrite: false });
assert(erpAdminReadHR.company_id === "co_main", "ERP Admin always restricted to Home Company");

// --- TEST CASE 6: HR Officer (Normal Role) reading HR records ---
const hrOfficerReadHR = applyDataScope(testUsers.hrOfficer, { module: MODULES.HR, isWrite: false });
assert(hrOfficerReadHR.company_id === "co_main", "Standard Officers always restricted to Home Company");

// --- TEST CASE 7: Missing Module Exception ---
const hrManagerMissingModule = applyDataScope(testUsers.hrManager, { isWrite: false });
assert(hrManagerMissingModule.company_id === "co_main", "Missing module context fails safe to Company-Locked access");

// --- TEST CASE 8: Invalid Module Exception ---
const hrManagerInvalidModule = applyDataScope(testUsers.hrManager, { module: "SECRET_VAULT", isWrite: false });
assert(hrManagerInvalidModule.company_id === "co_main", "Invalid module context fails safe to Company-Locked access");

console.log("\n------------------------------------------------");
const failed = results.filter(r => r.status === "FAIL").length;
if (failed === 0) {
    console.log("🏁 Audit Complete: ALL scoping security invariants are preserved.");
} else {
    console.log(`🏁 Audit Complete: ${failed} security boundaries were breached.`);
}
console.log("------------------------------------------------");
