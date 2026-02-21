"use strict";

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const logger = require("./logger");
const prisma = require("./db");

const app = express();

// ─── 1. Request Context (must be FIRST) ───────────────────────────────────────
const requestContext = require("./middleware/requestContext.middleware");
app.use(requestContext);

// ─── 2. Security Headers (Helmet) ─────────────────────────────────────────────
const { helmetConfig, corsOptions, authRateLimit, generalRateLimit } =
    require("./middleware/security.middleware");
app.use(helmetConfig);

// ─── 3. CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'https://constructor-erp-client.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
];

// Global CORS middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // Log all requests for debugging
    console.log(`${req.method} ${req.url} - Origin: ${origin}`);
    
    // Set CORS headers for all responses
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Headers', 
        'Content-Type, Authorization, x-company-id, x-idempotency-key, Idempotency-Key, x-request-id');
    res.header('Access-Control-Allow-Methods', 
        'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle OPTIONS method immediately
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        return res.status(204).end();
    }
    
    next();
});


// ─── 4. Compression ───────────────────────────────────────────────────────────
app.use(compression());

// ─── 5. Body Parsers (1 MB limit) ─────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── 6. HTTP Request Logging ──────────────────────────────────────────────────
app.use(
    morgan("combined", {
        stream: { write: (message) => logger.info(message.trim()) },
    })
);

// ─── 7. Rate Limiting ─────────────────────────────────────────────────────────
// Auth-specific: 10 per 15 min per IP
app.use("/api/auth/login", authRateLimit);
app.use("/api/auth/register", authRateLimit);
// General API: 300 per 15 min per IP
app.use("/api", generalRateLimit);

// ─── API Routes ───────────────────────────────────────────────
const authRoutes = require("./modules/auth/auth.routes");
const usersRoutes = require("./modules/users/users.routes");
const roleRoutes = require("./modules/roles/role.routes");
const permissionRoutes = require("./modules/permissions/permission.routes");
const projectAccessRoutes = require("./modules/projectAccess/projectAccess.routes");
const approvalRoutes = require("./modules/approvals/approvals.routes");
const sessionRoutes = require("./modules/session/session.routes");
const auditRoutes = require("./modules/audit/audit.routes");
const systemLogRoutes = require("./modules/systemLogs/systemLogs.routes");

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/project-access", projectAccessRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/system", systemLogRoutes);

// ─── Delegation Routes (Module 8) ─────────────────────────────────────────────
const delegationRoutes = require("./modules/delegations/delegations.routes");
app.use("/api/delegations", delegationRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.url} not found`,
        requestId: req.context?.requestId,
    });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use(async (err, req, res, next) => {
    const requestId = req.context?.requestId || null;

    // CORS errors from our strict policy
    if (err.message?.startsWith("CORS:")) {
        return res.status(403).json({ success: false, message: err.message, requestId });
    }

    logger.error(err.message, {
        stack: err.stack, url: req.url, method: req.method, requestId,
    });

    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal server error";

    if (err.code === "P2002") { statusCode = 400; message = "A record with this value already exists"; }
    else if (err.code === "P2025") { statusCode = 404; message = "Record not found"; }

    if (statusCode >= 500) {
        try {
            const { logSystem } = require("./modules/systemLogs/systemLogs.service");
            logSystem({
                level: "error",
                message: err.message || "Unhandled server error",
                context: { requestId, url: req.url, method: req.method, stack: err.stack, statusCode },
            }).catch(() => { });
        } catch (_) { /* module not available */ }
    }

    const response = { success: false, message, requestId };
    if (process.env.NODE_ENV !== "production") response.stack = err.stack;

    return res.status(statusCode).json(response);
});

module.exports = app;
