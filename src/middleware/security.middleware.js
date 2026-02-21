"use strict";

const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// ─────────────────────────────────────────────────────────────────────────────
// Allowed CORS origins — extend via CORS_ORIGINS env var (comma-separated)
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    "https://constructor-erp-client.vercel.app/",
    "http://localhost:5173",
    "http://localhost:3000",
];

const corsOptions = {
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
    },
    credentials: true,
    optionsSuccessStatus: 204
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
