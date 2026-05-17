"use strict";

const prisma = require("../../../db");
const { getVATReturnSummary } = require("../vat/vat.service");

/**
 * Converts array of flat objects to standard RFC 4180 CSV string.
 */
function jsonToCSV(array, headers) {
    if (!array || array.length === 0) return headers.join(",") + "\n";
    
    const rows = array.map(row => {
        return headers.map(header => {
            const val = row[header] ?? "";
            const escaped = String(val).replace(/"/g, '""');
            return `"${escaped}"`;
        }).join(",");
    });
    
    return [headers.join(",")].concat(rows).join("\n");
}

/**
 * Export VAT transactions to CSV format.
 */
async function exportVATTransactionsCSV(companyId, direction) {
    const where = { company_id: companyId, ...(direction ? { direction } : {}) };
    const txs = await prisma.vATTransaction.findMany({
        where,
        orderBy: { posting_date: "asc" }
    });

    const reportData = txs.map(tx => ({
        "Posting Date":    tx.posting_date.toISOString().split("T")[0],
        "Doc Type":        tx.document_type,
        "Doc ID":          tx.document_id,
        "Direction":       tx.direction,
        "VAT Type":        tx.vat_type,
        "Taxable Amount":  Number(tx.taxable_amount).toFixed(2),
        "VAT Rate":        Number(tx.vat_rate).toFixed(2) + "%",
        "VAT Amount":      Number(tx.vat_amount).toFixed(2),
    }));

    const headers = ["Posting Date", "Doc Type", "Doc ID", "Direction", "VAT Type", "Taxable Amount", "VAT Rate", "VAT Amount"];
    return jsonToCSV(reportData, headers);
}

/**
 * Export ZATCA submissions history.
 */
async function exportZATCASubmissionsCSV(companyId) {
    const subs = await prisma.zATCASubmission.findMany({
        where: { company_id: companyId },
        include: {
            invoice: { select: { invoice_no: true } }
        },
        orderBy: { created_at: "desc" }
    });

    const reportData = subs.map(sub => ({
        "Invoice ID":     sub.invoice_id,
        "Invoice No":     sub.invoice.invoice_no,
        "ZATCA Status":   sub.status,
        "ZATCA UUID":     sub.zatca_uuid || "",
        "Retry Count":    sub.retry_count,
        "Submitted At":   sub.submitted_at ? sub.submitted_at.toISOString() : "",
        "Cleared At":     sub.cleared_at ? sub.cleared_at.toISOString() : "",
        "Error Message":  sub.error_message || ""
    }));

    const headers = ["Invoice ID", "Invoice No", "ZATCA Status", "ZATCA UUID", "Retry Count", "Submitted At", "Cleared At", "Error Message"];
    return jsonToCSV(reportData, headers);
}

/**
 * Export Project Profitability details to CSV.
 */
async function exportProjectProfitabilityCSV(companyId, periodMonth) {
    const snapshots = await prisma.projectProfitSnapshot.findMany({
        where: { company_id: companyId, period_month: periodMonth },
        include: {
            project: { select: { name: true, code: true } }
        },
        orderBy: { net_profit: "desc" }
    });

    const reportData = snapshots.map(s => ({
        "Project Code":       s.project.code,
        "Project Name":       s.project.name,
        "Period Month":       s.period_month,
        "Revenue":            Number(s.revenue).toFixed(2),
        "Direct Costs":       Number(s.direct_costs).toFixed(2),
        "Labor Costs":        Number(s.labor_costs).toFixed(2),
        "Material Costs":     Number(s.material_costs).toFixed(2),
        "Overhead Allocated": Number(s.overhead_allocation).toFixed(2),
        "Net Profit":         Number(s.net_profit).toFixed(2),
        "Margin %":           Number(s.profit_margin_pct).toFixed(2) + "%",
    }));

    const headers = ["Project Code", "Project Name", "Period Month", "Revenue", "Direct Costs", "Labor Costs", "Material Costs", "Overhead Allocated", "Net Profit", "Margin %"];
    return jsonToCSV(reportData, headers);
}

/**
 * Formats an HTML table ready for Excel download.
 * When Content-Type is set to application/vnd.ms-excel, Excel renders this beautifully!
 */
function renderExcelTable(title, headers, rows) {
    return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <style>
            table { border-collapse: collapse; font-family: Arial, sans-serif; }
            th { background-color: #D3AF37; color: white; font-weight: bold; border: 1px solid #ddd; padding: 8px; }
            td { border: 1px solid #ddd; padding: 8px; }
            .title-row { font-size: 16px; font-weight: bold; padding: 12px; text-align: center; }
        </style>
    </head>
    <body>
        <table>
            <tr><td colspan="${headers.length}" class="title-row">${title}</td></tr>
            <tr></tr>
            <tr>
                ${headers.map(h => `<th>${h}</th>`).join("")}
            </tr>
            ${rows.map(row => `
                <tr>
                    ${row.map(cell => `<td>${cell}</td>`).join("")}
                </tr>
            `).join("")}
        </table>
    </body>
    </html>
    `;
}

/**
 * Export VAT Return details to Excel (vendor-excel HTML representation)
 */
async function exportVATFilingExcel(companyId, periodId) {
    const summary = await getVATReturnSummary(companyId, periodId);
    const headers = ["VAT Category", "Taxable Amount (SAR)", "VAT Rate", "VAT Amount (SAR)"];
    
    const rows = [
        ["Standard Rated Sales", summary.sales_standard_taxable.toFixed(2), "15%", summary.sales_standard_vat.toFixed(2)],
        ["Zero Rated Sales", summary.sales_zero_rated.toFixed(2), "0%", "0.00"],
        ["Exempt Sales", summary.sales_exempt.toFixed(2), "0%", "0.00"],
        ["Standard Rated Purchases", summary.purchases_standard_taxable.toFixed(2), "15%", summary.purchases_standard_vat.toFixed(2)],
        ["Reverse Charge Purchases", summary.reverse_charges.toFixed(2), "15%", summary.reverse_charges.toFixed(2)],
        ["Manual VAT Adjustments", "-", "-", summary.adjustment_amount.toFixed(2)],
        ["Carry Forward Credit Applied", "-", "-", summary.carry_forward_applied.toFixed(2)],
        ["Total VAT Due / Refund", "-", "-", summary.total_vat_due.toFixed(2)]
    ];

    return renderExcelTable(`VAT Filing Return Report — ${summary.period.period_name}`, headers, rows);
}

/**
 * Export Profitability details to Excel (vendor-excel HTML representation)
 */
async function exportProfitabilityExcel(companyId, periodMonth) {
    const snapshots = await prisma.projectProfitSnapshot.findMany({
        where: { company_id: companyId, period_month: periodMonth },
        include: { project: { select: { name: true, code: true } } },
        orderBy: { net_profit: "desc" }
    });

    const headers = ["Project Code", "Project Name", "Revenue (SAR)", "Direct Costs (SAR)", "Labor Costs (SAR)", "Material Costs (SAR)", "Overhead Allocated (SAR)", "Net Profit (SAR)", "Margin %"];
    const rows = snapshots.map(s => [
        s.project.code,
        s.project.name,
        Number(s.revenue).toFixed(2),
        Number(s.direct_costs).toFixed(2),
        Number(s.labor_costs).toFixed(2),
        Number(s.material_costs).toFixed(2),
        Number(s.overhead_allocation).toFixed(2),
        Number(s.net_profit).toFixed(2),
        Number(s.profit_margin_pct).toFixed(2) + "%"
    ]);

    return renderExcelTable(`Project Profitability Breakdown — ${periodMonth}`, headers, rows);
}

/**
 * Generates a stunning, bilingual (En/Ar), print-ready HTML template for Saudi Arabia VAT Filing Returns.
 */
async function exportVATFilingPrintHTML(companyId, periodId) {
    const summary = await getVATReturnSummary(companyId, periodId);
    const company = await prisma.company.findUnique({ where: { id: companyId } });

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>ZATCA Official VAT Return Form</title>
        <style>
            body { font-family: 'Outfit', sans-serif; margin: 30px; color: #1e1e1e; background-color: #fcfcfc; }
            .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #D3AF37; padding-bottom: 20px; }
            .logo-section h1 { font-size: 24px; color: #111; margin: 0; }
            .logo-section p { font-size: 13px; color: #666; margin: 4px 0 0 0; }
            .zatca-bilingual { text-align: right; }
            .zatca-bilingual h2 { font-size: 22px; color: #0d5f3a; margin: 0; }
            .zatca-bilingual p { font-size: 12px; color: #666; margin: 4px 0 0 0; }
            .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 30px 0; background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
            .meta-card h4 { font-size: 11px; text-transform: uppercase; color: #777; margin: 0 0 5px 0; }
            .meta-card p { font-size: 14px; font-weight: bold; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
            th { background-color: #f7f7f7; font-size: 12px; text-transform: uppercase; color: #555; }
            tr:hover { background-color: #fafafa; }
            .total-row { font-weight: bold; background-color: #fefcf3; border-top: 2px solid #D3AF37; }
            .footer-grid { display: flex; justify-content: space-between; margin-top: 50px; font-size: 12px; color: #777; border-top: 1px dashed #ddd; padding-top: 20px; }
            .bilingual-label { display: flex; justify-content: space-between; width: 100%; font-size: 13px; }
            @media print {
                body { margin: 0; background: #white; }
                .no-print { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="header-container">
            <div class="logo-section">
                <h1>${company.name || "CONSTRUCTION ERP"}</h1>
                <p>VAT Registration: ${company.vat_number || "300000000000003"}</p>
            </div>
            <div class="zatca-bilingual">
                <h2>ZATCA e-Filing Return Form</h2>
                <p>الهيئة العامة للزكاة والضريبة والجمارك</p>
            </div>
        </div>

        <div class="meta-grid">
            <div class="meta-card">
                <h4>Filing Period / الفترة الضريبية</h4>
                <p>${summary.period.period_name}</p>
            </div>
            <div class="meta-card">
                <h4>Filing Date / تاريخ التقديم</h4>
                <p>${new Date().toISOString().split("T")[0]}</p>
            </div>
            <div class="meta-card">
                <h4>Status / الحالة</h4>
                <p style="color: #0d5f3a;">FILED / APPROVED</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th><div class="bilingual-label"><span>VAT Category</span><span>الفئة الضريبية</span></div></th>
                    <th style="text-align: right;"><div class="bilingual-label"><span>Taxable Amount</span><span>المبلغ الخاضع للضريبة</span></div></th>
                    <th style="text-align: right;"><div class="bilingual-label"><span>VAT Rate</span><span>نسبة الضريبة</span></div></th>
                    <th style="text-align: right;"><div class="bilingual-label"><span>VAT Amount</span><span>مبلغ الضريبة</span></div></th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Standard Rated Sales / المبيعات الخاضعة للنسبة الأساسية</td>
                    <td style="text-align: right;">SAR ${summary.sales_standard_taxable.toFixed(2)}</td>
                    <td style="text-align: right;">15%</td>
                    <td style="text-align: right; color: #0d5f3a;">SAR ${summary.sales_standard_vat.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Zero Rated Sales / المبيعات الخاضعة للنسبة الصفرية</td>
                    <td style="text-align: right;">SAR ${summary.sales_zero_rated.toFixed(2)}</td>
                    <td style="text-align: right;">0%</td>
                    <td style="text-align: right;">SAR 0.00</td>
                </tr>
                <tr>
                    <td>Exempt Sales / المبيعات المعفاة</td>
                    <td style="text-align: right;">SAR ${summary.sales_exempt.toFixed(2)}</td>
                    <td style="text-align: right;">0%</td>
                    <td style="text-align: right;">SAR 0.00</td>
                </tr>
                <tr>
                    <td>Standard Rated Purchases / المشتريات الخاضعة للنسبة الأساسية</td>
                    <td style="text-align: right;">SAR ${summary.purchases_standard_taxable.toFixed(2)}</td>
                    <td style="text-align: right;">15%</td>
                    <td style="text-align: right; color: #c0392b;">SAR ${summary.purchases_standard_vat.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Reverse Charge Purchases / الاستيراد الخاضع للاحتساب العكسي</td>
                    <td style="text-align: right;">SAR ${summary.reverse_charges.toFixed(2)}</td>
                    <td style="text-align: right;">15%</td>
                    <td style="text-align: right; color: #c0392b;">SAR ${summary.reverse_charges.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Manual VAT Adjustments / تسويات ضريبة القيمة المضافة</td>
                    <td style="text-align: right;">-</td>
                    <td style="text-align: right;">-</td>
                    <td style="text-align: right;">SAR ${summary.adjustment_amount.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Carry Forward Credit Applied / الرصيد الدائن المرحل</td>
                    <td style="text-align: right;">-</td>
                    <td style="text-align: right;">-</td>
                    <td style="text-align: right; color: #0d5f3a;">SAR ${summary.carry_forward_applied.toFixed(2)}</td>
                </tr>
                <tr class="total-row">
                    <td>Total VAT Due / Net Payable / صافي الضريبة المستحقة</td>
                    <td style="text-align: right;">-</td>
                    <td style="text-align: right;">-</td>
                    <td style="text-align: right; font-size: 16px; color: ${summary.total_vat_due >= 0 ? "#0d5f3a" : "#c0392b"};">
                        SAR ${summary.total_vat_due.toFixed(2)}
                    </td>
                </tr>
            </tbody>
        </table>

        <div class="footer-grid">
            <div>
                <p>Taxpayer Declaration: We hereby declare that the details provided are correct and complete.</p>
                <p>إقرار المكلف: نقر بموجب هذا بأن البيانات المقدمة صحيحة وكاملة.</p>
            </div>
            <div style="text-align: right;">
                <p>Signature & Seal / التوقيع والختم الرسمي</p>
                <div style="margin-top: 15px; border-bottom: 1px solid #111; width: 150px; display: inline-block;"></div>
            </div>
        </div>
        
        <div style="margin-top: 30px;" class="no-print">
            <button onclick="window.print()" style="background-color: #D3AF37; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; border-radius: 4px; cursor: pointer;">
                Print Report / طباعة التقرير
            </button>
        </div>
    </body>
    </html>
    `;
}

/**
 * Generates a stunning, premium, print-ready HTML template for Company & Project Profitability Analysis.
 */
async function exportProfitabilityPrintHTML(companyId, periodMonth) {
    const snapshots = await prisma.projectProfitSnapshot.findMany({
        where: { company_id: companyId, period_month: periodMonth },
        include: { project: { select: { name: true, code: true } } },
        orderBy: { net_profit: "desc" }
    });

    const company = await prisma.company.findUnique({ where: { id: companyId } });

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Corporate Profitability Analysis</title>
        <style>
            body { font-family: 'Outfit', sans-serif; margin: 30px; color: #1e1e1e; background-color: #fcfcfc; }
            .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #D3AF37; padding-bottom: 20px; }
            .logo-section h1 { font-size: 24px; color: #111; margin: 0; }
            .logo-section p { font-size: 13px; color: #666; margin: 4px 0 0 0; }
            .title-section { text-align: right; }
            .title-section h2 { font-size: 22px; color: #D3AF37; margin: 0; }
            .title-section p { font-size: 12px; color: #666; margin: 4px 0 0 0; }
            .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 30px 0; background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
            .meta-card h4 { font-size: 11px; text-transform: uppercase; color: #777; margin: 0 0 5px 0; }
            .meta-card p { font-size: 14px; font-weight: bold; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
            th { background-color: #f7f7f7; font-size: 12px; text-transform: uppercase; color: #555; }
            tr:hover { background-color: #fafafa; }
            .total-row { font-weight: bold; background-color: #fefcf3; border-top: 2px solid #D3AF37; }
            @media print {
                body { margin: 0; background: white; }
                .no-print { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="header-container">
            <div class="logo-section">
                <h1>${company.name || "CONSTRUCTION ERP"}</h1>
                <p>Profitability Ledger</p>
            </div>
            <div class="title-section">
                <h2>Project Profitability Breakdown</h2>
                <p>Report Period: ${periodMonth}</p>
            </div>
        </div>

        <div class="meta-grid">
            <div class="meta-card">
                <h4>Company Name</h4>
                <p>${company.name}</p>
            </div>
            <div class="meta-card">
                <h4>Analysis Scope</h4>
                <p>All Active Projects</p>
            </div>
            <div class="meta-card">
                <h4>Total Scored Projects</h4>
                <p>${snapshots.length}</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Project Code</th>
                    <th>Project Name</th>
                    <th style="text-align: right;">Revenue</th>
                    <th style="text-align: right;">Direct Costs</th>
                    <th style="text-align: right;">Overhead Allocated</th>
                    <th style="text-align: right;">Net Profit</th>
                    <th style="text-align: right;">Margin %</th>
                </tr>
            </thead>
            <tbody>
                ${snapshots.map(s => `
                    <tr>
                        <td>${s.project.code}</td>
                        <td>${s.project.name}</td>
                        <td style="text-align: right;">SAR ${Number(s.revenue).toFixed(2)}</td>
                        <td style="text-align: right; color: #c0392b;">SAR ${Number(s.direct_costs).toFixed(2)}</td>
                        <td style="text-align: right; color: #c0392b;">SAR ${Number(s.overhead_allocation).toFixed(2)}</td>
                        <td style="text-align: right; color: #0d5f3a; font-weight: bold;">SAR ${Number(s.net_profit).toFixed(2)}</td>
                        <td style="text-align: right; font-weight: bold;">${Number(s.profit_margin_pct).toFixed(2)}%</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>

        <div style="margin-top: 30px;" class="no-print">
            <button onclick="window.print()" style="background-color: #D3AF37; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; border-radius: 4px; cursor: pointer;">
                Print Report / طباعة التقرير
            </button>
        </div>
    </body>
    </html>
    `;
}

module.exports = {
    exportVATTransactionsCSV,
    exportZATCASubmissionsCSV,
    exportProjectProfitabilityCSV,
    exportVATFilingExcel,
    exportProfitabilityExcel,
    exportVATFilingPrintHTML,
    exportProfitabilityPrintHTML
};
