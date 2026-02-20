"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🏙️  Seeding Enterprise Dummy Data...");

    // 1. Fetch some users and roles for assignments
    const pm = await prisma.user.findFirst({ where: { email: "pm@erp.com" } });
    const engineer = await prisma.user.findFirst({ where: { email: "engineer@erp.com" } });
    const admin = await prisma.user.findFirst({ where: { email: "superadmin@erp.com" } });

    if (!pm || !engineer || !admin) {
        throw new Error("Core test users not found! Run seed_rbac first.");
    }

    // 2. Seed Projects
    console.log("📂 Creating Projects...");
    const projectsData = [
        { code: "PRJ-NEOM-01", name: "NEOM Infrastructure P1", description: "Urban planning and road networks", status: "active" },
        { code: "PRJ-RYD-MET", name: "Riyadh Metro Ext", description: "Line 7 extension and station works", status: "active" },
        { code: "PRJ-RED-SEA", name: "Red Sea Luxury Resort", description: "Coastal development and villas", status: "active" }
    ];

    const projects = {};
    for (const p of projectsData) {
        projects[p.code] = await prisma.project.upsert({
            where: { code: p.code },
            update: { name: p.name, description: p.description, status: p.status },
            create: p
        });
        console.log(`✔  Project: ${p.name}`);
    }

    // 3. Project Assignments
    console.log("\n🔗 Assigning Users to Projects...");
    const assignments = [
        { user_id: pm.id, project_id: projects["PRJ-NEOM-01"].id, access_type: "full", assigned_by: admin.id },
        { user_id: pm.id, project_id: projects["PRJ-RYD-MET"].id, access_type: "full", assigned_by: admin.id },
        { user_id: engineer.id, project_id: projects["PRJ-RYD-MET"].id, access_type: "read_only", assigned_by: admin.id }
    ];

    for (const a of assignments) {
        await prisma.userProject.upsert({
            where: { id: "00000000-0000-0000-0000-000000000000" }, // dummy where to always create if not exist (using create instead)
            update: {},
            create: a
        }).catch(() => { }); // ignore duplicates if logic is simple
    }
    console.log("✔  User-Project assignments seeded.");

    // 4. Seeding Approval Inbox
    console.log("\n📥 Seeding Approval Inbox...");
    const pmRole = await prisma.role.findFirst({ where: { code: "project_manager" } });

    // Create a pending PR request directed at the PM role
    const prRequest = await prisma.approvalRequest.create({
        data: {
            doc_type: "PR",
            doc_id: "77777777-7777-7777-7777-777777777777", // mock doc id
            project_id: projects["PRJ-NEOM-01"].id,
            requested_by: engineer.id,
            current_status: "in_progress",
            total_steps: 1,
            current_step: 1,
            approval_steps: {
                create: [
                    {
                        step_order: 1,
                        role_id: pmRole.id,
                        status: "pending",
                        action: null
                    }
                ]
            }
        }
    });
    console.log(`✔  Pending Approval seeded: PR-7777 (Project Manager)`);

    // 5. Seed Audit Logs
    console.log("\n📜 Seeding Audit Logs...");
    const actions = ["LOGIN", "CREATE_USER", "UPDATE_PROJECT", "SUBMIT_PR", "ASSIGN_ACCESS"];
    for (let i = 0; i < 15; i++) {
        await prisma.auditLog.create({
            data: {
                user_id: pm.id,
                module: "general",
                entity: "system",
                action: actions[i % actions.length],
                after_data: { note: `Automated seed entry ${i + 1}` },
                ip_address: "127.0.0.1",
                created_at: new Date(Date.now() - i * 1000 * 60 * 60) // hourly steps back
            }
        });
    }
    console.log("✔  15 Audit logs seeded.");

    console.log("\n✅  Seeding Complete!");
}

main()
    .catch((err) => {
        console.error("\n❌  Seed error:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
