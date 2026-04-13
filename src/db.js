const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

let connectionString = process.env.DATABASE_URL || "";

// Force SSL if missing (Render external connections require this)
if (connectionString && !connectionString.includes("sslmode=") && !connectionString.includes("ssl=")) {
    connectionString += (connectionString.includes("?") ? "&" : "?") + "sslmode=require";
}

if (!connectionString) {
    console.error("CRITICAL: DATABASE_URL is not defined in environment variables!");
} else {
    const maskedUrl = connectionString.replace(/:([^@]+)@/, ":****@");
    console.log(`[DB] Initializing connection with: ${maskedUrl}`);
}

const poolConfig = {
    connectionString,
    max: process.env.NODE_ENV === "production" ? 3 : 10,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000, // Increased to 30s for cross-region stability
    idleTimeoutMillis: 60000,
    keepalives: true,
};

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
    console.error("PostgreSQL Pool Error:", err);
});

const adapter = new PrismaPg(pool);

/**
 * Prisma Client Singleton
 * ─────────────────────────────────────────────────────────────────────────────
 * Ensures only one instance of the Prisma Client exists in the global scope 
 * during the application lifecycle. This is critical in serverless 
 * environments (Vercel) to prevent connection pool exhaustion.
 */
let prisma;

if (process.env.NODE_ENV === "production") {
    prisma = new PrismaClient({ adapter });
} else {
    if (!global.prisma) {
        global.prisma = new PrismaClient({ adapter });
    }
    prisma = global.prisma;
}

module.exports = prisma;
