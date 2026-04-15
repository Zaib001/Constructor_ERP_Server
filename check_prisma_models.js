"use strict";

const prisma = require("./src/db");

async function checkPrismaKeys() {
    console.log("🔍 Checking Prisma Client Model Names...");
    const keys = Object.keys(prisma).filter(k => !k.startsWith('_') && typeof prisma[k] === 'object');
    console.log("Found models:", keys.join(", "));
    
    if (keys.includes("wbs")) {
        console.log("✅ 'wbs' model is available.");
    } else {
        console.log("❌ 'wbs' model is MISSING.");
        const wbsMatch = keys.find(k => k.toLowerCase() === "wbs");
        if (wbsMatch) {
            console.log(`💡 Found potential match: '${wbsMatch}'`);
        }
    }
    
    process.exit(0);
}

checkPrismaKeys();
