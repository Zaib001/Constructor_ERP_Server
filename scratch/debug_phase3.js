"use strict";
require("dotenv").config();
const prisma = require("../src/db");

async function debug() {
    try {
        console.log("--- COMPANIES IN DB ---");
        const companies = await prisma.company.findMany();
        console.table(companies.map(c => ({ id: c.id, name: c.name })));

        console.log("\n--- ISSUED POs BY COMPANY ---");
        const pos = await prisma.purchaseOrder.findMany({
            where: { status: "issued" },
            include: { company: true }
        });
        console.table(pos.map(p => ({
            po_number: p.po_number,
            company: p.company?.name,
            company_id: p.company_id,
            project: p.project_id
        })));

        console.log("\n--- RECENT ACTIVE SESSIONS ---");
        const sessions = await prisma.userSession.findMany({
            where: { is_active: true },
            orderBy: { login_time: "desc" },
            take: 3,
            include: { users: { include: { company: true } } }
        });
        console.table(sessions.map(s => ({
            user: s.users?.name,
            email: s.users?.email,
            company: s.users?.company?.name,
            company_id: s.users?.company_id
        })));

        console.log("\n--- DELIVERY TRACKING AUDIT ---");
        const tracks = await prisma.deliveryTracking.findMany({
            include: { company: true }
        });
        console.table(tracks.map(t => ({
            id: t.id,
            company: t.company?.name,
            company_id: t.company_id,
            project: t.project_id,
            po_id: t.po_id
        })));

    } catch (err) {
        console.error("Debug failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
