"use strict";
const express = require("express");
const path = require("path");
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
app.use(cors(corsOptions));

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

// ─── Health Check (Foundation) ────────────────────────────────────────────────
app.get("/health", async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({
            status: "ok",
            database: "connected",
            timestamp: new Date(),
            requestId: req.context?.requestId
        });
    } catch (err) {
        logger.error("Health check failed", err);
        res.status(503).json({
            status: "error",
            database: "disconnected",
            message: err.message,
            requestId: req.context?.requestId
        });
    }
});


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

const delegationRoutes = require("./modules/delegations/delegations.routes");
const storageRoutes = require("./modules/storage/storage.routes");
const departmentsRoutes = require("./modules/departments/departments.routes");
const companiesRoutes = require("./modules/companies/companies.routes");
const settingsRoutes = require("./modules/settings/settings.routes");
const profitShareRoutes = require("./modules/profitShare/profitShare.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const vendorsRoutes = require("./modules/vendors/vendors.routes");
const purchaseOrdersRoutes = require("./modules/purchaseOrders/purchaseOrders.routes");
const quotationsRoutes = require("./modules/quotations/quotations.routes");
const payrollRoutes = require("./modules/payroll/payroll.routes");
const expensesRoutes = require("./modules/expenses/expenses.routes");
const projectProgressRoutes = require("./modules/projectProgress/projectProgress.routes");
const wbsRoutes = require("./modules/wbs/wbs.routes");
const itemsRoutes = require("./modules/items/items.routes");
const employeesRoutes = require("./modules/employees/employees.routes");
const vehiclesRoutes = require("./modules/vehicles/vehicles.routes");
const equipmentRoutes = require("./modules/equipment/equipment.routes");
const documentsRoutes = require("./modules/documents/documents.routes");
const inventoryRoutes = require("./modules/inventory/inventory.routes");
const projectsRoutes = require("./modules/projects/projects.routes");
const purchaseRequisitionsRoutes = require("./modules/purchaseRequisitions/purchaseRequisitions.routes");
const rfqsRoutes = require("./modules/rfqs/rfqs.routes");
const pettyCashRoutes = require("./modules/pettyCash/pettyCash.routes");
const petrolExpensesRoutes = require("./modules/petrolExpenses/petrolExpenses.routes");
const monitoringRoutes = require("./modules/monitoring/monitoring.routes");
const executionRoutes = require("./modules/execution/execution.routes");
const qualityRoutes = require("./modules/quality/quality.routes");
const hseRoutes = require("./modules/hse/hse.routes");
const riskRoutes = require("./modules/risk/risk.routes");
const procurementRoutes = require("./modules/procurement/procurement.routes");
const projectPipelineRoutes = require("./modules/projectPipeline/projectPipeline.routes");
const projectClosureRoutes = require("./modules/projectClosure/projectClosure.routes");



app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/project-access", projectAccessRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/system", systemLogRoutes);
app.use("/api/delegations", delegationRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/profit-share", profitShareRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/vendors", vendorsRoutes);
app.use("/api/purchase-orders", purchaseOrdersRoutes);
app.use("/api/quotations", quotationsRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/project-progress", projectProgressRoutes);
app.use("/api/wbs", wbsRoutes);
app.use("/api/items", itemsRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/vehicles", vehiclesRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/purchase-requisitions", purchaseRequisitionsRoutes);
app.use("/api/rfqs", rfqsRoutes);
app.use("/api/petty-cash", pettyCashRoutes);
app.use("/api/petrol-expenses", petrolExpensesRoutes);
app.use("/api/execution", executionRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/quality", qualityRoutes);
app.use("/api/hse", hseRoutes);
app.use("/api/risk", riskRoutes);
app.use("/api/procurement", procurementRoutes);
app.use("/api/project-pipeline", projectPipelineRoutes);
app.use("/api/project-closure", projectClosureRoutes);

// ─── 7. Static Files (Uploads) ────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

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
    else if (err.code === "P2003") { statusCode = 400; message = "Related record not found. Please check the selected values."; }
    else if (err.code === "P2014") { statusCode = 400; message = "Invalid relation data provided."; }

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
// Trigger reboot
