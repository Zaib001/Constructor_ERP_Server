const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = `${process.env.DATABASE_URL}`;

const poolConfig = {
    connectionString,
    max: process.env.NODE_ENV === "production" ? 3 : 8, // Low limit for serverless cold-starts
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
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
