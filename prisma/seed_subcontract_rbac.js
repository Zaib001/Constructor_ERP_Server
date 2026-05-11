"use strict";

require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    console.log("🚀 Seeding Subcontractor Management RBAC...");

    // 1. New Permissions
    const permissionData = [
        { code: "subcontract.read", module: "subcontract", description: "View Subcontract Work Orders and tracking" },
        { code: "subcontract.write", module: "subcontract", description: "Create and modify Subcontract Work Orders" },
        { code: "subcontract.delete", module: "subcontract", description: "Delete/Archive Subcontract Work Orders" },
        { code: "subcontract.workorder.approve", module: "subcontract", description: "Approve Work Orders" },
        { code: "subcontract.measurement.read", module: "subcontract", description: "View measurements" },
        { code: "subcontract.measurement.write", module: "subcontract", description: "Submit measurements" },
        { code: "subcontract.rabill.read", module: "subcontract", description: "View RA Bills" },
        { code: "subcontract.rabill.write", module: "subcontract", description: "Generate RA Bills" },
        { code: "subcontract.rabill.certify", module: "subcontract", description: "QS Certification of RA Bills" },
        { code: "subcontract.rabill.finance_approve", module: "subcontract", description: "Finance/Admin approval of RA Bills" },
        { code: "subcontract.payment.read", module: "subcontract", description: "View payments" },
        { code: "subcontract.payment.write", module: "subcontract", description: "Process payments" }
    ];

    const permissions = {};
    for (const p of permissionData) {
        permissions[p.code] = await prisma.permission.upsert({
            where: { code: p.code },
            update: p,
            create: p
        });
    }

    // 2. New Role: Quantity Surveyor
    const qsRole = await prisma.role.upsert({
        where: { code: "quantity_surveyor" },
        update: { name: "Quantity Surveyor", is_system_role: false },
        create: { code: "quantity_surveyor", name: "Quantity Surveyor", is_system_role: false }
    });

    // 3. Mapping
    console.log("🔗 Mapping Permissions to Roles...");

    const getRoleId = async (code) => {
        const r = await prisma.role.findUnique({ where: { code } });
        return r ? r.id : null;
    };

    const adminRoleId = await getRoleId("super_admin");
    const erpAdminRoleId = await getRoleId("erp_admin");
    const pmRoleId = await getRoleId("project_manager");

    const associations = [];

    // All for admins
    for (const code of permissionData.map(p => p.code)) {
        if (adminRoleId) associations.push({ role_id: adminRoleId, permission_id: permissions[code].id });
        if (erpAdminRoleId) associations.push({ role_id: erpAdminRoleId, permission_id: permissions[code].id });
    }

    // QS Permissions
    const qsPerms = ["subcontract.read", "subcontract.measurement.read", "subcontract.measurement.write", "subcontract.rabill.read", "subcontract.rabill.certify", "dashboard.project", "masterdata.read"];
    for (const code of qsPerms) {
        const perm = await prisma.permission.findUnique({ where: { code } });
        if (perm) associations.push({ role_id: qsRole.id, permission_id: perm.id });
    }

    // PM Permissions
    const pmPerms = ["subcontract.read", "subcontract.workorder.approve", "subcontract.rabill.read", "subcontract.rabill.finance_approve"];
    for (const code of pmPerms) {
        const perm = await prisma.permission.findUnique({ where: { code } });
        if (perm && pmRoleId) associations.push({ role_id: pmRoleId, permission_id: perm.id });
    }

    await prisma.rolePermission.createMany({
        data: associations,
        skipDuplicates: true
    });

    // 4. Approval Matrices
    console.log("📝 Setting up Approval Matrices for Subcontractor module...");
    const companies = await prisma.company.findMany();

    for (const co of companies) {
        console.log(`📍 Configuring matrices for company: ${co.name}`);
        
        // 1. Clear existing for these types
        await prisma.approvalMatrix.deleteMany({
            where: { 
                company_id: co.id, 
                doc_type: { in: ["SWO", "SRB"] } 
            }
        });

        // 2. SWO: 1 Step (PM)
        if (pmRoleId) {
            await prisma.approvalMatrix.create({
                data: {
                    company_id: co.id,
                    doc_type: "SWO",
                    role_id: pmRoleId,
                    step_order: 1
                }
            });
        }

        // 3. SRB: 2 Steps (QS then PM)
        const srbData = [];
        if (qsRole.id) {
            srbData.push({
                company_id: co.id,
                doc_type: "SRB",
                role_id: qsRole.id,
                step_order: 1
            });
        }
        if (pmRoleId) {
            srbData.push({
                company_id: co.id,
                doc_type: "SRB",
                role_id: pmRoleId,
                step_order: 2
            });
        }

        if (srbData.length > 0) {
            await prisma.approvalMatrix.createMany({ data: srbData });
        }
    }

    console.log("✅ Subcontractor RBAC Seeding Complete!");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
