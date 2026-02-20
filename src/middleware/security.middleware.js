"use strict";

const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// ─────────────────────────────────────────────────────────────────────────────
// Allowed CORS origins — extend via CORS_ORIGINS env var (comma-separated)
// ─────────────────────────────────────────────────────────────────────────────
const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://staging.construction-erp.com",
    "https://erp.construction-erp.com",
];

const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : defaultOrigins;

const corsOptions = {
    origin(origin, callback) {
        // Allow server-to-server / Postman requests (no origin header)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-company-id",
        "x-idempotency-key",
        "Idempotency-Key",
        "x-request-id",
    ],
    exposedHeaders: ["x-request-id"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 204,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helmet — security headers
// ─────────────────────────────────────────────────────────────────────────────
const helmetConfig = helmet({
    // Basic CSP — tightened per module later
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    // HSTS — 1yr, include subdomains (only effective in production/HTTPS)
    strictTransportSecurity:
        process.env.NODE_ENV === "production"
            ? { maxAge: 31536000, includeSubDomains: true }
            : false,
    // Hide Express fingerprint
    xPoweredBy: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

/** Auth endpoints: 10 attempts per 15 minutes per IP */
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts, please try again later" },
    skip: () => process.env.NODE_ENV === "test",
});

/** General API: 300 requests per 15 minutes per IP */
const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please slow down" },
    skip: () => process.env.NODE_ENV === "test",
});

module.exports = {
    helmetConfig,
    corsOptions,
    authRateLimit,
    generalRateLimit,
};
