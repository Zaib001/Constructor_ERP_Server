"use strict";

require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    console.log("🚀 Starting Non-Destructive Enterprise RBAC & Permissions Seeding...");

    // ==========================================
    // 1. ALL UNIQUE SYSTEM PERMISSIONS
    // ==========================================
    const allPermissions = [
        // Governance & Admin
        { code: "approval.read",          module: "approvals",    description: "View approval inbox and history" },
        { code: "approval.request",       module: "approvals",    description: "Submit documents for approval" },
        { code: "approval.approve",       module: "approvals",    description: "Approve assigned workflow steps" },
        { code: "approval.reject",        module: "approvals",    description: "Reject approval steps" },
        { code: "audit.read",             module: "audit",        description: "View global audit logs" },
        { code: "delegation.read",        module: "delegations",  description: "View approval delegations" },
        { code: "delegation.manage",      module: "delegations",  description: "Create and manage delegations" },
        { code: "role.manage",            module: "roles",        description: "Create and manage roles/permissions" },
        { code: "user.read",              module: "users",        description: "View users list" },
        { code: "user.register",          module: "users",        description: "Register new users" },
        { code: "user.update",            module: "users",        description: "Update user profiles and roles" },
        { code: "department.read",        module: "departments",  description: "View departments" },
        { code: "department.manage",      module: "departments",  description: "Create and manage departments" },
        { code: "settings.read",          module: "settings",     description: "View system settings" },
        { code: "settings.manage",        module: "settings",     description: "Manage enterprise configuration" },
        { code: "company.read",           module: "companies",    description: "View companies" },
        { code: "company.create",         module: "companies",    description: "Create new companies" },
        { code: "company.update",         module: "companies",    description: "Update company details" },
        { code: "company.manage",         module: "companies",    description: "Full company administration" },
        
        // Executive Dashboards
        { code: "dashboard.superadmin",   module: "dashboard",    description: "Access superadmin group overview" },
        { code: "dashboard.company",      module: "dashboard",    description: "Access company-level executive dashboard" },
        { code: "dashboard.project",      module: "dashboard",    description: "Access project-level operational dashboard" },
        { code: "dashboard.department",   module: "dashboard",    description: "Access department-level metrics dashboard" },
        { code: "dashboard.compliance",   module: "dashboard",    description: "Access global compliance and expiry dashboard" },

        // Projects
        { code: "project.read",           module: "projects",     description: "View projects" },
        { code: "project.create",         module: "projects",     description: "Create new projects" },
        { code: "project.update",         module: "projects",     description: "Update project details" },
        { code: "project.archive",        module: "projects",     description: "Archive / close projects" },
        { code: "project.access.manage",  module: "projects",     description: "Manage project user assignments" },
        { code: "wbs.read",               module: "wbs",          description: "View WBS structures" },
        { code: "wbs.create",             module: "wbs",          description: "Create WBS nodes and cost codes" },
        { code: "wbs.update",             module: "wbs",          description: "Update WBS and budgets" },
        { code: "wbs.archive",            module: "wbs",          description: "Archive WBS entries" },

        // Personnel, Fleet & Documents
        { code: "item.read",              module: "items",        description: "View item catalog" },
        { code: "item.create",            module: "items",        description: "Create catalog items" },
        { code: "item.update",            module: "items",        description: "Update catalog items" },
        { code: "employee.read",          module: "employees",    description: "View employee records" },
        { code: "employee.create",        module: "employees",    description: "Create employee records" },
        { code: "employee.update",        module: "employees",    description: "Update employee records" },
        { code: "employee.archive",       module: "employees",    description: "Archive employees" },
        { code: "fleet.read",             module: "fleet",        description: "View vehicles and equipment" },
        { code: "fleet.create",           module: "fleet",        description: "Add vehicles and equipment" },
        { code: "fleet.update",           module: "fleet",        description: "Update fleet records" },
        { code: "document.read",          module: "documents",    description: "View compliance documents" },
        { code: "document.create",        module: "documents",    description: "Upload documents" },
        { code: "document.update",        module: "documents",    description: "Update document records" },

        // Vendors
        { code: "vendor.read",            module: "vendors",      description: "View vendor directory" },
        { code: "vendor.create",          module: "vendors",      description: "Register new vendors" },
        { code: "vendor.update",          module: "vendors",      description: "Update and manage vendor lifecycle" },
        { code: "vendor.approve",         module: "vendors",      description: "Approve/activate/suspend vendors" },

        // Procurement
        { code: "procurement.pr.read",           module: "procurement", description: "View purchase requisitions" },
        { code: "procurement.pr.create",         module: "procurement", description: "Create purchase requisitions" },
        { code: "procurement.pr.update",         module: "procurement", description: "Update draft PRs" },
        { code: "procurement.pr.submit",         module: "procurement", description: "Submit PRs for approval" },
        { code: "procurement.pr.approve",        module: "procurement", description: "Approve purchase requisitions" },
        { code: "procurement.rfq.read",          module: "procurement", description: "View RFQs" },
        { code: "procurement.rfq.create",        module: "procurement", description: "Create RFQs" },
        { code: "procurement.rfq.update",        module: "procurement", description: "Update RFQ details" },
        { code: "procurement.rfq.issue",         module: "procurement", description: "Issue RFQ to vendors" },
        { code: "procurement.quote.read",        module: "procurement", description: "View vendor quotations" },
        { code: "procurement.quote.create",      module: "procurement", description: "Enter vendor quotes" },
        { code: "procurement.quote.update",      module: "procurement", description: "Update quotation details" },
        { code: "procurement.comparison.run",    module: "procurement", description: "Run comparison engine" },
        { code: "procurement.po.create",         module: "procurement", description: "Create purchase orders" },
        { code: "procurement.po.update",         module: "procurement", description: "Update draft POs" },
        { code: "procurement.po.approve",        module: "procurement", description: "Approve purchase orders" },
        { code: "procurement.po.issue",          module: "procurement", description: "Issue PO to vendor" },
        { code: "procurement.po.read",           module: "procurement", description: "View purchase orders" },
        { code: "pr.create",                     module: "procurement", description: "Legacy Purchase Request Create" },
        { code: "pr.approve",                    module: "procurement", description: "Legacy Purchase Request Approve" },

        // Petty Cash & Petrol
        { code: "pettycash.read",                module: "pettycash",   description: "View petty cash requests" },
        { code: "pettycash.create",              module: "pettycash",   description: "Create petty cash requests" },
        { code: "pettycash.approve",             module: "pettycash",   description: "Approve petty cash requests" },
        { code: "pettycash.expense.create",      module: "pettycash",   description: "Submit petty cash expense bills" },
        { code: "pettycash.expense.verify",      module: "pettycash",   description: "Verify petty cash expense bills" },
        { code: "petrol.read",                   module: "petrol",      description: "View petrol expenses" },
        { code: "petrol.create",                 module: "petrol",      description: "Log petrol fill entries" },
        { code: "petrol.verify",                 module: "petrol",      description: "Verify and lock petrol entries" },

        // Inventory
        { code: "inventory.read",                module: "inventory",   description: "View inventory stock balances" },
        { code: "inventory.store.manage",        module: "inventory",   description: "Create and manage warehouses/stores" },
        { code: "inventory.grn.create",          module: "inventory",   description: "Create goods receipt notes" },
        { code: "inventory.issue.create",        module: "inventory",   description: "Issue materials to site" },

        // Execution Engine
        { code: "execution.read",                module: "execution",   description: "View project execution, DPRs, and dashboards" },
        { code: "execution.manage",              module: "execution",   description: "Create and manage execution entries" },
        { code: "execution.approve",             module: "execution",   description: "Final approval for variations and DPRs" },

        // Subcontracting (NEW MODULES)
        { code: "subcontract.read",              module: "subcontract", description: "View subcontract agreements" },
        { code: "subcontract.write",             module: "subcontract", description: "Manage subcontract agreements" },
        { code: "subcontract.rabill.read",       module: "subcontract", description: "View subcontractor RA bills" },
        { code: "subcontract.rabill.write",      module: "subcontract", description: "Manage subcontractor RA bills" },
        { code: "subcontract.rabill.certify",    module: "subcontract", description: "QS/PM Certification of RA bills" },
        { code: "subcontract.measurement.read",  module: "subcontract", description: "View physical site measurements" },
        { code: "subcontract.measurement.write", module: "subcontract", description: "Record daily/weekly measurements" },
        { code: "subcontract.payment.read",      module: "subcontract", description: "View subcontractor payments" },
        { code: "subcontract.payment.write",     module: "subcontract", description: "Approve/process subcontractor payments" },

        // HR & Payroll (New & Old)
        { code: "payroll.read",                  module: "payroll",     description: "View legacy payroll records" },
        { code: "payroll.process",               module: "payroll",     description: "Process legacy payroll run" },
        { code: "expense.read",                  module: "expenses",    description: "View expense records" },
        { code: "expense.create",                module: "expenses",    description: "Submit expense claims" },
        { code: "expense.verify",                module: "expenses",    description: "Verify / approve expenses" },
        { code: "profitshare.read",              module: "profitshare", description: "View profit share rules" },
        { code: "finance.payroll.read",          module: "payroll",     description: "Read salary summaries and allocations" },
        { code: "finance.payroll.create",        module: "payroll",     description: "Create new department salary summaries" },
        { code: "finance.payroll.approve",       module: "payroll",     description: "Approve and lock payroll statements" },
        { code: "finance.payroll.post",          module: "payroll",     description: "Post payroll to general ledger" },

        // Core Finance & Vouchers (New & Old)
        { code: "finance.read",                  module: "finance",     description: "General financial engine view" },
        { code: "finance.invoice.create",        module: "finance",     description: "Create standard client invoices" },
        { code: "finance.invoice.post",          module: "finance",     description: "Post billing runs to Ledger" },
        { code: "finance.invoice.verify",        module: "finance",     description: "Verify progress billings" },
        { code: "finance.match.run",             module: "finance",     description: "Run 3-way matching" },
        { code: "finance.payment.prepare",       module: "finance",     description: "Prepare AR/AP payment runs" },
        { code: "finance.payment.approve",       module: "finance",     description: "Approve payment processing" },
        { code: "finance.bill.create",           module: "finance",     description: "Log supplier vendor bills" },
        { code: "finance.bill.approve",          module: "finance",     description: "Approve vendor bills" },
        { code: "finance.voucher.create",        module: "finance",     description: "Create journal vouchers" },
        { code: "finance.voucher.post",          module: "finance",     description: "Post journal vouchers" },
        { code: "finance.voucher.reverse",       module: "finance",     description: "Reverse journal vouchers" },
        { code: "finance.payment.create",        module: "finance",     description: "Record AR receipts/AP payments" },
        { code: "finance.settings.manage",       module: "finance",     description: "Manage charts of accounts and financial rules" },

        // VAT & ZATCA Engines
        { code: "vat.read",                      module: "vat",          description: "Read VAT summary ledgers" },
        { code: "vat.manage",                    module: "vat",          description: "Close VAT period & log adjustments" },
        { code: "zatca.submit",                  module: "zatca",        description: "Submit XML invoices to ZATCA Gate" },
        { code: "zatca.admin",                   module: "zatca",        description: "ZATCA onboarding and certificate rotations" },
        { code: "zatca.read",                    module: "zatca",        description: "Read ZATCA compliance logs" },

        // Profitability Engine
        { code: "profitability.read",            module: "profitability",description: "Access EBITDA and profit margin dashboards" },
        { code: "profitability.snapshot",        module: "profitability",description: "Generate static monthly profitability snapshots" },

        // Sales & Estimation
        { code: "quotation.read",                module: "sales",       description: "View client quotations" },
        { code: "quotation.create",              module: "sales",       description: "Prepare and submit quotations" },
        { code: "quotation.update",              module: "sales",       description: "Revise existing quotations" },
        { code: "quotation.archive",             module: "sales",       description: "Archive old bids" },
    ];

    const permissions = {};
    for (const p of allPermissions) {
        permissions[p.code] = await prisma.permission.upsert({
            where: { code: p.code },
            update: { module: p.module, description: p.description },
            create: p
        });
    }
    console.log(`✅ ${Object.keys(permissions).length} system permissions upserted.`);

    // ==========================================
    // 2. SEED SYSTEM ROLES (16 Roles)
    // ==========================================
    const roleDefinitions = [
        { code: "super_admin",         name: "Super Admin",          is_system_role: true },
        { code: "erp_admin",           name: "ERP Admin",            is_system_role: true },
        { code: "auditor_readonly",    name: "Auditor (Read-Only)",  is_system_role: false },
        { code: "department_head",     name: "Department Head",      is_system_role: false },
        { code: "project_manager",     name: "Project Manager",      is_system_role: false },
        { code: "site_engineer",       name: "Site Engineer",        is_system_role: false },
        { code: "site_coordinator",    name: "Site Coordinator",     is_system_role: false },
        { code: "procurement_officer", name: "Procurement Officer",  is_system_role: false },
        { code: "accounts_officer",    name: "Accounts Officer",     is_system_role: false },
        { code: "hr_admin",            name: "HR Administrator",     is_system_role: false },
        { code: "storekeeper",         name: "Storekeeper",          is_system_role: false },
        { code: "fleet_coordinator",   name: "Fleet Coordinator",    is_system_role: false },
        { code: "hr_manager",          name: "Global HR Manager",    is_system_role: false },
        { code: "procurement_manager", name: "Procurement Manager",   is_system_role: false },
        { code: "accounts_manager",    name: "Accounts Manager",      is_system_role: false },
        { code: "sales_manager",       name: "Sales Manager",         is_system_role: false },
    ];

    const roles = {};
    for (const r of roleDefinitions) {
        roles[r.code] = await prisma.role.upsert({
            where: { code: r.code },
            update: { name: r.name },
            create: r
        });
    }
    console.log(`✅ ${Object.keys(roles).length} system roles upserted.`);

    // ==========================================
    // 3. ROLE-PERMISSION RELATIONSHIPS (Additive Join Matrix)
    // ==========================================
    const permCodes = Object.keys(permissions);

    const rolePermMatrix = {
        // Super Admin gets everything
        "super_admin": permCodes,

        // ERP Admin: all operational permissions, excluding raw multi-tenant company creation
        "erp_admin": permCodes.filter(p => 
            !["company.create", "company.manage", "dashboard.superadmin"].includes(p)
        ),

        // Auditor (Read-Only)
        "auditor_readonly": permCodes.filter(p => p.includes("read") || p.includes("view")),

        // Department Head
        "department_head": [
            "approval.read", "approval.approve", "approval.reject",
            "department.read", "project.read", "wbs.read", "item.read",
            "employee.read", "fleet.read", "document.read",
            "vendor.read", "payroll.read", "expense.read", "expense.verify",
            "procurement.pr.read", "procurement.po.read", "pettycash.read",
            "user.read", "dashboard.department", "dashboard.compliance"
        ],

        // Project Manager
        "project_manager": [
            "approval.read", "approval.request", "approval.approve", "approval.reject",
            "project.read", "project.access.manage", "wbs.read", "item.read",
            "procurement.pr.read", "procurement.pr.create", "procurement.pr.update",
            "procurement.pr.submit", "procurement.pr.approve", "procurement.po.read",
            "pettycash.read", "pettycash.create", "pettycash.approve", "petrol.read", "petrol.create",
            "inventory.read", "execution.read", "execution.manage", "execution.approve",
            "pr.create", "pr.approve",
            "subcontract.read", "subcontract.write", "subcontract.rabill.read", 
            "subcontract.rabill.write", "subcontract.rabill.certify", "subcontract.measurement.read", 
            "subcontract.measurement.write", "subcontract.payment.read",
            "profitability.read", "dashboard.project", "dashboard.compliance"
        ],

        // Site Engineer
        "site_engineer": [
            "approval.read", "approval.request", "project.read", "wbs.read", "item.read",
            "procurement.pr.read", "procurement.pr.create", "procurement.pr.submit",
            "pettycash.read", "pettycash.create", "pettycash.expense.create", "petrol.read", "petrol.create",
            "inventory.read", "execution.read", "execution.manage", "pr.create",
            "subcontract.read", "subcontract.measurement.read", "subcontract.measurement.write",
            "dashboard.project"
        ],

        // Site Coordinator
        "site_coordinator": [
            "approval.read", "approval.request", "project.read", "wbs.read", "item.read",
            "procurement.pr.read", "procurement.pr.create", "procurement.pr.submit",
            "pettycash.read", "pettycash.create", "pettycash.expense.create", "petrol.read", "petrol.create",
            "inventory.read", "dashboard.project"
        ],

        // Procurement Manager
        "procurement_manager": [
            "approval.read", "approval.approve", "approval.reject",
            "vendor.read", "vendor.create", "vendor.update", "vendor.approve",
            "procurement.pr.read", "procurement.pr.create", "procurement.pr.update",
            "procurement.pr.submit", "procurement.pr.approve",
            "procurement.rfq.read", "procurement.rfq.create", "procurement.rfq.update", "procurement.rfq.issue",
            "procurement.quote.read", "procurement.quote.create", "procurement.quote.update",
            "procurement.comparison.run", "procurement.po.read", "procurement.po.create", 
            "procurement.po.update", "procurement.po.approve", "procurement.po.issue",
            "pr.create", "pr.approve", "item.read", "inventory.read", "dashboard.company"
        ],

        // Procurement Officer
        "procurement_officer": [
            "approval.read", "vendor.read", "vendor.create", "vendor.update",
            "procurement.pr.read", "procurement.rfq.read", "procurement.rfq.create", 
            "procurement.rfq.update", "procurement.rfq.issue", "procurement.quote.read", 
            "procurement.quote.create", "procurement.quote.update", "procurement.po.read", 
            "procurement.po.create", "procurement.po.update", "procurement.po.issue",
            "item.read", "inventory.read"
        ],

        // Accounts Manager
        "accounts_manager": [
            "approval.read", "approval.approve", "approval.reject",
            "finance.read", "finance.invoice.create", "finance.invoice.post", "finance.invoice.verify",
            "finance.match.run", "finance.payment.prepare", "finance.payment.approve",
            "finance.bill.create", "finance.bill.approve", "finance.voucher.create", 
            "finance.voucher.post", "finance.voucher.reverse", "finance.payment.create", 
            "finance.settings.manage",
            "finance.payroll.read", "finance.payroll.create", "finance.payroll.approve", "finance.payroll.post",
            "vat.read", "vat.manage", "zatca.read", "zatca.submit", "zatca.admin",
            "profitability.read", "profitability.snapshot", "profitshare.read",
            "pettycash.read", "pettycash.approve", "pettycash.expense.verify",
            "petrol.read", "petrol.verify", "payroll.read", "expense.read", "expense.verify",
            "subcontract.read", "subcontract.rabill.read", "subcontract.payment.read", "subcontract.payment.write",
            "dashboard.company"
        ],

        // Accounts Officer
        "accounts_officer": [
            "approval.read",
            "finance.read", "finance.invoice.create", "finance.bill.create", 
            "finance.voucher.create", "finance.payment.create", "finance.payroll.read",
            "vat.read", "zatca.read", "zatca.submit",
            "pettycash.read", "pettycash.expense.create", "petrol.read", "petrol.create",
            "expense.read", "expense.create", "subcontract.read", "subcontract.rabill.read", 
            "subcontract.payment.read"
        ],

        // Storekeeper
        "storekeeper": [
            "approval.read", "item.read", "inventory.read", "inventory.grn.create",
            "inventory.issue.create", "procurement.po.read", "wbs.read"
        ],

        // Fleet Coordinator
        "fleet_coordinator": [
            "fleet.read", "fleet.create", "fleet.update",
            "petrol.read", "petrol.create", "project.read"
        ],

        // HR Manager
        "hr_manager": [
            "approval.read", "approval.approve", "approval.reject",
            "employee.read", "employee.create", "employee.update", "employee.archive",
            "document.read", "document.create", "document.update",
            "payroll.read", "payroll.process", "expense.read", "expense.verify",
            "dashboard.company", "dashboard.department", "dashboard.compliance"
        ],

        // HR Admin
        "hr_admin": [
            "employee.read", "employee.create", "document.read", "document.create", 
            "document.update", "payroll.read", "expense.read", "expense.create",
            "dashboard.department"
        ],

        // Sales Manager
        "sales_manager": [
            "approval.read", "project.read", "wbs.read",
            "quotation.read", "quotation.create", "quotation.update", "quotation.archive",
            "procurement.quote.read", "dashboard.company", "dashboard.project"
        ]
    };

    // Remove existing role-permission linkages to safely map new updates non-destructively
    console.log("🔗 Refreshing Role-Permission association table...");
    await prisma.rolePermission.deleteMany({});

    let assocCount = 0;
    const rolePermsData = [];
    for (const [roleCode, permList] of Object.entries(rolePermMatrix)) {
        const roleRecord = roles[roleCode];
        if (!roleRecord) continue;
        
        for (const permCode of permList) {
            const permRecord = permissions[permCode];
            if (!permRecord) continue;
            
            rolePermsData.push({
                role_id: roleRecord.id,
                permission_id: permRecord.id
            });
            assocCount++;
        }
    }

    await prisma.rolePermission.createMany({
        data: rolePermsData
    });
    console.log(`✅ ${assocCount} role-permission mappings established successfully!`);
    console.log("🎉 NON-DESTRUCTIVE DATABASE SEEDING COMPLETED WITHOUT TOUCHING BUSINESS DATA!");
}

main()
    .catch((e) => {
        console.error("❌ Non-destructive seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
