"use strict";

require("dotenv").config();
const prisma = require("../src/db");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 10;

async function main() {
    console.log("🚀 Starting Non-Destructive Seeding of Requested Users...");

    // Get the company
    const company = await prisma.company.findUnique({
        where: { code: "ANT-CONS" }
    });
    if (!company) {
        throw new Error("Company with code ANT-CONS not found in database.");
    }
    console.log(`🏢 Target Company found: ${company.name} (${company.id})`);

    // Upsert Departments first to avoid foreign key/referential integrity failures
    const deptsToUpsert = [
        { code: "DEPT-CIV", name: "Civil Engineering", company_id: company.id },
        { code: "DEPT-MEP", name: "MEP & Electrical", company_id: company.id },
        { code: "DEPT-PRO", name: "Procurement & Logistics", company_id: company.id },
        { code: "DEPT-ADM", name: "Administration & HR", company_id: company.id },
        { code: "DEPT-FIN", name: "Finance & Accounts", company_id: company.id },
        { code: "DEPT-FLT", name: "Fleet & Equipment", company_id: company.id }
    ];

    console.log("📂 Upserting departments...");
    for (const d of deptsToUpsert) {
        await prisma.department.upsert({
            where: { code: d.code },
            update: { name: d.name, company_id: d.company_id },
            create: d
        });
    }

    // Get departments mapping
    const departments = await prisma.department.findMany({
        where: { company_id: company.id }
    });
    const deptMap = new Map(departments.map(d => [d.code, d.id]));
    console.log(`📂 Loaded ${deptMap.size} departments.`);

    // Get roles mapping
    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map(r => [r.code, r.id]));
    console.log(`🔐 Loaded ${roleMap.size} roles.`);

    const passwordHash = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);

    const usersToUpsert = [
        { email: "superadmin@erp.com",    name: "Super Admin",         role: "super_admin",         dept: "DEPT-ADM" },
        { email: "admin@erp.com",         name: "Tariq ERP Admin",     role: "erp_admin",            dept: "DEPT-ADM" },
        { email: "auditor@erp.com",       name: "Nadia Auditor",       role: "auditor_readonly",     dept: "DEPT-FIN" },
        { email: "pm@erp.com",            name: "Ahmed Manager",       role: "project_manager",      dept: "DEPT-CIV" },
        { email: "engineer@erp.com",      name: "Sara Engineer",       role: "site_engineer",        dept: "DEPT-CIV" },
        { email: "coordinator@erp.com",   name: "Faisal Coordinator",  role: "site_coordinator",     dept: "DEPT-CIV" },
        { email: "procurement@erp.com",   name: "Karim Procurement",   role: "procurement_officer",  dept: "DEPT-PRO" },
        { email: "accounts@erp.com",      name: "Layla Accounts",      role: "accounts_officer",     dept: "DEPT-FIN" },
        { email: "storekeeper@erp.com",   name: "Omar Store",          role: "storekeeper",          dept: "DEPT-PRO" },
        { email: "fleet@erp.com",         name: "Walid Fleet",         role: "fleet_coordinator",    dept: "DEPT-FLT" },
        { email: "hrmanager@erp.com",     name: "Zaid Global HR",      role: "hr_manager",           dept: "DEPT-ADM" },
        { email: "procmanager@erp.com",   name: "Lina Global Proc",    role: "procurement_manager",  dept: "DEPT-PRO" },
        { email: "hr@erp.com",            name: "Mona HR",             role: "hr_admin",             dept: "DEPT-ADM" }
    ];

    for (const u of usersToUpsert) {
        const roleId = roleMap.get(u.role);
        if (!roleId) {
            console.warn(`⚠️ Role ${u.role} not found for user ${u.email}, skipping.`);
            continue;
        }

        const deptId = u.dept ? deptMap.get(u.dept) : null;
        if (u.dept && !deptId) {
            console.warn(`⚠️ Department ${u.dept} not found for user ${u.email}, skipping.`);
            continue;
        }

        console.log(`👤 Upserting user: ${u.email} (${u.name})`);

        await prisma.user.upsert({
            where: { email: u.email },
            update: {
                name: u.name,
                password_hash: passwordHash,
                role_id: roleId,
                department_id: deptId,
                company_id: company.id,
                is_active: true
            },
            create: {
                email: u.email,
                name: u.name,
                password_hash: passwordHash,
                role_id: roleId,
                department_id: deptId,
                company_id: company.id,
                is_active: true
            }
        });
    }

    // Now, assign projects to the Project Manager, Site Engineer, and Site Coordinator
    const neom = await prisma.project.findFirst({ where: { code: "PRJ-NEOM-9" } });
    const metro = await prisma.project.findFirst({ where: { code: "PRJ-METRO-7" } });

    if (neom && metro) {
        console.log("🔗 Mapping User-Project Assignments...");
        const pm = await prisma.user.findUnique({ where: { email: "pm@erp.com" } });
        const engineer = await prisma.user.findUnique({ where: { email: "engineer@erp.com" } });
        const coordinator = await prisma.user.findUnique({ where: { email: "coordinator@erp.com" } });
        const procurement = await prisma.user.findUnique({ where: { email: "procurement@erp.com" } });
        const accounts = await prisma.user.findUnique({ where: { email: "accounts@erp.com" } });

        const assignments = [
            { user_id: pm.id,          project_id: neom.id,   access_type: "project_manager" },
            { user_id: pm.id,          project_id: metro.id,  access_type: "project_manager" },
            { user_id: engineer.id,    project_id: neom.id,   access_type: "site_engineer" },
            { user_id: coordinator.id, project_id: neom.id,   access_type: "site_coordinator" },
            { user_id: procurement.id, project_id: neom.id,   access_type: "procurement_officer" },
            { user_id: accounts.id,    project_id: neom.id,   access_type: "accounts_officer" }
        ];

        for (const assoc of assignments) {
            const existingAssoc = await prisma.userProject.findFirst({
                where: { user_id: assoc.user_id, project_id: assoc.project_id }
            });
            if (!existingAssoc) {
                await prisma.userProject.create({ data: assoc });
            }
        }
    }

    console.log("🎉 User upserts completed successfully!");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
