"use strict";

const express = require("express");
const router = express.Router();
const authenticate = require("../../middleware/authenticateJWT");

// Import sub-routers
const coaRoutes = require("./coa/coa.routes");
const periodRoutes = require("./periods/periods.routes");
const taxRoutes = require("./tax/tax.routes");
const bankRoutes = require("./bank/bank.routes");
const voucherRoutes = require("./vouchers/vouchers.routes");
const ledgerRoutes = require("./ledger/ledger.routes");
const invoiceRoutes = require("./invoices/invoices.routes");
const receiptRoutes = require("./receipts/receipts.routes");
const vendorBillRoutes = require("./vendorBills/vendorBills.routes");
const vendorPaymentRoutes = require("./vendorPayments/vendorPayments.routes");
const payrollRoutes = require("./payroll/payroll.routes");
const settingsRoutes = require("./settings/financeSettings.routes");
const reportRoutes = require("./reports/reports.routes");
const dashboardRoutes = require("./dashboard/dashboard.routes");

// Apply auth to all finance routes
router.use(authenticate);

router.use("/coa", coaRoutes);
router.use("/periods", periodRoutes);
router.use("/tax", taxRoutes);
router.use("/bank", bankRoutes);
router.use("/vouchers", voucherRoutes);
router.use("/ledger", ledgerRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/receipts", receiptRoutes);
router.use("/vendor-bills", vendorBillRoutes);
router.use("/vendor-payments", vendorPaymentRoutes);
router.use("/payroll", payrollRoutes);
router.use("/settings", settingsRoutes);
router.use("/reports", reportRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;
