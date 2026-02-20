"use strict";
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function test() {
    try {
        await prisma.$connect();
        console.log("✅ Database connection successful!");
        const usersCount = await prisma.user.count();
        console.log(`📊 Current user count: ${usersCount}`);
    } catch (err) {
        console.error("❌ Database connection failed:");
        console.error(err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

test();
