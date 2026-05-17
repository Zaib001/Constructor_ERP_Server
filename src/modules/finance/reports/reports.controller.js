"use strict";

const service = require("./reports.service");

const getPnL = async (req, res) => {
    try {
        const data = await service.getPnL(req.user.companyId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getBalanceSheet = async (req, res) => {
    try {
        const data = await service.getBalanceSheet(req.user.companyId, req.query.date);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getTrialBalance = async (req, res) => {
    try {
        const data = await service.getTrialBalance(req.user.companyId, req.query.date);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getCashFlow = async (req, res) => {
    try {
        const data = await service.getCashFlow(req.user.companyId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const exportService = require("./export.service");

const exportVATReport = async (req, res, next) => {
    try {
        const { format, periodId } = req.query;

        if (format === "excel" && periodId) {
            const excel = await exportService.exportVATFilingExcel(req.user.companyId, periodId);
            res.setHeader("Content-Type", "application/vnd.ms-excel");
            res.setHeader("Content-Disposition", `attachment; filename=vat_filing_${periodId}.xls`);
            return res.send(excel);
        }

        if ((format === "print" || format === "pdf") && periodId) {
            const html = await exportService.exportVATFilingPrintHTML(req.user.companyId, periodId);
            res.setHeader("Content-Type", "text/html");
            return res.send(html);
        }

        // Default to CSV
        const csv = await exportService.exportVATTransactionsCSV(req.user.companyId, req.query.direction);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=vat_report_${Date.now()}.csv`);
        res.send(csv);
    } catch (err) { next(err); }
};

const exportZATCALog = async (req, res, next) => {
    try {
        const csv = await exportService.exportZATCASubmissionsCSV(req.user.companyId);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=zatca_compliance_log_${Date.now()}.csv`);
        res.send(csv);
    } catch (err) { next(err); }
};

const exportProfitabilityReport = async (req, res, next) => {
    try {
        const { format } = req.query;
        const periodMonth = req.query.periodMonth || new Date().toISOString().slice(0, 7);

        if (format === "excel") {
            const excel = await exportService.exportProfitabilityExcel(req.user.companyId, periodMonth);
            res.setHeader("Content-Type", "application/vnd.ms-excel");
            res.setHeader("Content-Disposition", `attachment; filename=project_profitability_${periodMonth}.xls`);
            return res.send(excel);
        }

        if (format === "print" || format === "pdf") {
            const html = await exportService.exportProfitabilityPrintHTML(req.user.companyId, periodMonth);
            res.setHeader("Content-Type", "text/html");
            return res.send(html);
        }

        // Default CSV
        const csv = await exportService.exportProjectProfitabilityCSV(req.user.companyId, periodMonth);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=project_profitability_${periodMonth}.csv`);
        res.send(csv);
    } catch (err) { next(err); }
};

module.exports = {
    getPnL,
    getBalanceSheet,
    getTrialBalance,
    getCashFlow,
    exportVATReport,
    exportZATCALog,
    exportProfitabilityReport
};
