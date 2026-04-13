"use strict";
require("dotenv").config();
const prisma = require("../src/db");

async function seed() {
    const companyId = "b5a9e2db-661c-481f-a83e-f173abc42e2e"; // Antigravity Construction

    console.log("🌱 Seeding Mobilization Logs (General Procurement)...");

    const logs = [
        {
            company_id: companyId,
            project_id: null,
            resource_type: "MANPOWER",
            resource_name: "Carpenter Team (10 Persons)",
            planned_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            actual_date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
            status: "mobilized",
            remarks: "Mobilized for general workshop expansion"
        },
        {
            company_id: companyId,
            project_id: null,
            resource_type: "MANPOWER",
            resource_name: "Electrical Support Group (5 Persons)",
            planned_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // in 2 days
            status: "pending",
            remarks: "Awaiting final clearance for site entry"
        },
        {
            company_id: companyId,
            project_id: null,
            resource_type: "EQUIPMENT",
            resource_name: "Excavator CAT 320",
            planned_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            actual_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            status: "mobilized",
            remarks: "Transferred from stockyard"
        },
        {
            company_id: companyId,
            project_id: null,
            resource_type: "EQUIPMENT",
            resource_name: "Mobile Crane 50T",
            planned_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
            status: "pending",
            remarks: "Scheduled for yard organization"
        }
    ];

    try {
        for (const log of logs) {
            await prisma.mobilizationLog.create({ data: log });
        }
        console.log("✅ Seeded 4 mobilization logs.");
    } catch (err) {
        console.error("❌ Seeding failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

seed();
