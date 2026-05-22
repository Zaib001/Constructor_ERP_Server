"use strict";

const db = require("../../db");
const { resolveAccount, checkPeriodGuard, generateSequenceNo } = require("../finance/finance.utils");
const logger = require("../../logger");

// ============================================================
// ASSET REGISTRATION
// ============================================================
async function createAsset(data, user) {
    const companyId = user.companyId;
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const count = await db.asset.count({ where: { company_id: companyId } });
    const asset_code = `AST-${yearMonth}-${String(count + 1).padStart(4, "0")}`;

    const purchaseCost = parseFloat(data.purchase_cost);
    if (isNaN(purchaseCost) || purchaseCost <= 0) throw new Error("Invalid purchase cost.");
    if (!data.useful_life_months || parseInt(data.useful_life_months) <= 0)
        throw new Error("Useful life in months must be positive.");

    return db.asset.create({
        data: {
            company_id: companyId,
            asset_code,
            asset_name: data.asset_name,
            category: data.category,
            purchase_date: new Date(data.purchase_date),
            purchase_cost: purchaseCost,
            supplier_id: data.supplier_id || null,
            serial_number: data.serial_number || null,
            warranty_expiry: data.warranty_expiry ? new Date(data.warranty_expiry) : null,
            depreciation_method: data.depreciation_method || "STRAIGHT_LINE",
            useful_life_months: parseInt(data.useful_life_months),
            salvage_value: parseFloat(data.salvage_value || 0),
            current_book_value: purchaseCost,
            location: data.location || null,
            project_id: data.project_id || null,
            department_id: data.department_id || null,
            status: "DRAFT"
        }
    });
}

async function listAssets(companyId, filters = {}) {
    const { page = 1, pageSize = 50, status, project_id, department_id } = filters;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const where = { company_id: companyId };
    if (status) where.status = status;
    if (project_id) where.project_id = project_id;
    if (department_id) where.department_id = department_id;

    const [data, total] = await Promise.all([
        db.asset.findMany({
            where,
            skip,
            take: parseInt(pageSize),
            include: {
                project: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                supplier: { select: { id: true, name: true } },
                allocations: { where: { status: "ACTIVE" }, take: 1 }
            },
            orderBy: { created_at: "desc" }
        }),
        db.asset.count({ where })
    ]);
    return { data, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

async function getAssetById(id, companyId) {
    const asset = await db.asset.findFirst({
        where: { id, company_id: companyId },
        include: {
            project: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
            allocations: {
                include: {
                    employee: { select: { id: true, name: true } },
                    project: { select: { id: true, name: true } }
                },
                orderBy: { allocated_date: "desc" }
            },
            ledger_entries: { orderBy: { transaction_date: "desc" } }
        }
    });
    if (!asset) throw new Error("Asset not found.");
    return asset;
}

// ============================================================
// ASSET APPROVAL + GL POSTING
// ============================================================
async function approveAsset(id, companyId, approverId) {
    const asset = await db.asset.findFirst({ where: { id, company_id: companyId } });
    if (!asset) throw new Error("Asset not found.");
    if (asset.status !== "DRAFT")
        throw new Error(`Asset is already in status: ${asset.status}. Only DRAFT assets can be approved.`);

    return db.$transaction(async (tx) => {
        const fixedAssetAcc = await resolveAccount(companyId, "FIXED_ASSET_ACCOUNT");
        const payableAcc = await resolveAccount(companyId, "ACCOUNTS_PAYABLE");

        await checkPeriodGuard(companyId, asset.purchase_date);

        const voucherNo = await generateSequenceNo(companyId, "VOUCHER", "AST", tx);
        const amount = Number(asset.purchase_cost);

        // GL Double Entry: Debit Fixed Asset / Credit Accounts Payable
        await tx.generalLedger.createMany({
            data: [
                {
                    company_id: companyId,
                    account_id: fixedAssetAcc.id,
                    voucher_no: voucherNo,
                    debit: amount,
                    credit: 0,
                    narration: `Asset Purchase: ${asset.asset_name} (${asset.asset_code})`,
                    posting_date: asset.purchase_date,
                    reference_type: "ASSET",
                    reference_id: id
                },
                {
                    company_id: companyId,
                    account_id: payableAcc.id,
                    voucher_no: voucherNo,
                    debit: 0,
                    credit: amount,
                    narration: `Asset Purchase Payable: ${asset.asset_name} (${asset.asset_code})`,
                    posting_date: asset.purchase_date,
                    reference_type: "ASSET",
                    reference_id: id
                }
            ]
        });

        await tx.assetLedger.create({
            data: {
                asset_id: id,
                transaction_type: "PURCHASE",
                amount,
                narration: `Initial purchase posted to GL (${voucherNo})`
            }
        });

        return tx.asset.update({
            where: { id },
            data: { status: "APPROVED" }
        });
    });
}

// ============================================================
// ASSET ALLOCATION
// ============================================================
async function allocateAsset(id, companyId, allocationData, allocatedBy) {
    const asset = await db.asset.findFirst({ where: { id, company_id: companyId } });
    if (!asset) throw new Error("Asset not found.");
    if (!["APPROVED", "ACTIVE"].includes(asset.status))
        throw new Error("Only approved or active assets can be allocated.");

    // Close previous active allocation
    await db.assetAllocation.updateMany({
        where: { asset_id: id, status: "ACTIVE" },
        data: { status: "RETURNED", return_date: new Date() }
    });

    const allocation = await db.assetAllocation.create({
        data: {
            asset_id: id,
            project_id: allocationData.project_id || null,
            department_id: allocationData.department_id || null,
            employee_id: allocationData.employee_id || null,
            allocated_by: allocatedBy,
            notes: allocationData.notes || null,
            status: "ACTIVE"
        }
    });

    await db.asset.update({
        where: { id },
        data: {
            status: "ACTIVE",
            project_id: allocationData.project_id || asset.project_id,
            department_id: allocationData.department_id || asset.department_id,
            allocated_employee_id: allocationData.employee_id || null
        }
    });

    return allocation;
}

// ============================================================
// DEPRECIATION ENGINE — Straight Line (extensible)
// ============================================================
async function runDepreciation(companyId, periodMonth, userId) {
    const existing = await db.assetDepreciationRun.findUnique({
        where: { company_id_period_month: { company_id: companyId, period_month: periodMonth } }
    });
    if (existing) throw new Error(`Depreciation already posted for period: ${periodMonth}`);

    // Advisory lock to prevent concurrent runs
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`DEPR-${companyId}-${periodMonth}`}))`;

    const depreciationExpAcc = await resolveAccount(companyId, "DEPRECIATION_EXPENSE");
    const accumulatedDepAcc = await resolveAccount(companyId, "ACCUMULATED_DEPRECIATION");

    const [year, month] = periodMonth.split("-").map(Number);
    const periodDate = new Date(year, month - 1, 1);

    await checkPeriodGuard(companyId, periodDate);

    const activeAssets = await db.asset.findMany({
        where: {
            company_id: companyId,
            status: { in: ["ACTIVE", "APPROVED"] },
            current_book_value: { gt: 0 }
        }
    });

    return db.$transaction(async (tx) => {
        let totalDepreciation = 0;
        const ledgerEntries = [];
        const glEntries = [];
        const voucherNo = await generateSequenceNo(companyId, "VOUCHER", "DEP", tx);

        for (const asset of activeAssets) {
            const purchaseCost = Number(asset.purchase_cost);
            const salvageValue = Number(asset.salvage_value);
            const bookValue = Number(asset.current_book_value);

            if (bookValue <= salvageValue) continue;

            let monthlyDepr = 0;
            if (asset.depreciation_method === "STRAIGHT_LINE") {
                monthlyDepr = (purchaseCost - salvageValue) / asset.useful_life_months;
            }
            // Extensible: DECLINING_BALANCE and UNITS_OF_PRODUCTION reserved here

            monthlyDepr = Math.min(monthlyDepr, bookValue - salvageValue);
            monthlyDepr = Math.round(monthlyDepr * 100) / 100;
            if (monthlyDepr <= 0) continue;

            totalDepreciation += monthlyDepr;
            const newBookValue = Math.round((bookValue - monthlyDepr) * 100) / 100;
            const newAccDepr = Math.round((Number(asset.accumulated_depreciation) + monthlyDepr) * 100) / 100;

            ledgerEntries.push({
                asset_id: asset.id,
                transaction_type: "DEPRECIATION",
                amount: monthlyDepr,
                period_month: periodMonth,
                narration: `Monthly depreciation (${asset.depreciation_method}) for ${periodMonth}`
            });

            glEntries.push(
                {
                    company_id: companyId,
                    account_id: depreciationExpAcc.id,
                    voucher_no: voucherNo,
                    debit: monthlyDepr,
                    credit: 0,
                    narration: `Depreciation Expense: ${asset.asset_name} (${asset.asset_code})`,
                    posting_date: periodDate,
                    reference_type: "ASSET_DEPRECIATION",
                    reference_id: asset.id
                },
                {
                    company_id: companyId,
                    account_id: accumulatedDepAcc.id,
                    voucher_no: voucherNo,
                    debit: 0,
                    credit: monthlyDepr,
                    narration: `Accumulated Depreciation: ${asset.asset_name} (${asset.asset_code})`,
                    posting_date: periodDate,
                    reference_type: "ASSET_DEPRECIATION",
                    reference_id: asset.id
                }
            );

            await tx.asset.update({
                where: { id: asset.id },
                data: { current_book_value: newBookValue, accumulated_depreciation: newAccDepr }
            });
        }

        if (ledgerEntries.length === 0)
            throw new Error("No depreciable assets found for this period.");

        const run = await tx.assetDepreciationRun.create({
            data: {
                company_id: companyId,
                period_month: periodMonth,
                total_depreciation: totalDepreciation,
                processed_by: userId,
                status: "POSTED"
            }
        });

        await tx.assetLedger.createMany({
            data: ledgerEntries.map(e => ({ ...e, run_id: run.id }))
        });

        await tx.generalLedger.createMany({ data: glEntries });

        logger.info(`[DEPRECIATION] Period ${periodMonth}: ${ledgerEntries.length} assets, total = ${totalDepreciation}`);
        return { run, assets_processed: ledgerEntries.length, total_depreciation: totalDepreciation };
    });
}

// ============================================================
// ASSET DISPOSAL — Financially Reconciled
// ============================================================
async function disposeAsset(id, companyId, disposalData, userId) {
    const asset = await db.asset.findFirst({ where: { id, company_id: companyId } });
    if (!asset) throw new Error("Asset not found.");
    if (asset.status === "DISPOSED") throw new Error("Asset is already disposed.");

    return db.$transaction(async (tx) => {
        const disposalDate = new Date(disposalData.disposal_date || new Date());
        const disposalProceeds = parseFloat(disposalData.disposal_amount || 0);
        const bookValue = Number(asset.current_book_value);
        const accDepr = Number(asset.accumulated_depreciation);
        const purchaseCost = Number(asset.purchase_cost);
        const gainOrLoss = disposalProceeds - bookValue;

        await checkPeriodGuard(companyId, disposalDate);

        const fixedAssetAcc = await resolveAccount(companyId, "FIXED_ASSET_ACCOUNT");
        const accumulatedDepAcc = await resolveAccount(companyId, "ACCUMULATED_DEPRECIATION");
        const cashAcc = await resolveAccount(companyId, "CASH_OR_BANK");
        const gainLossAcc = gainOrLoss >= 0
            ? await resolveAccount(companyId, "ASSET_DISPOSAL_GAIN")
            : await resolveAccount(companyId, "ASSET_DISPOSAL_LOSS");

        const voucherNo = await generateSequenceNo(companyId, "VOUCHER", "DSP", tx);

        const glEntries = [
            { company_id: companyId, account_id: accumulatedDepAcc.id, voucher_no: voucherNo, debit: accDepr, credit: 0, narration: `Reversal of Accum. Depr on disposal: ${asset.asset_code}`, posting_date: disposalDate, reference_type: "ASSET_DISPOSAL", reference_id: id },
            { company_id: companyId, account_id: fixedAssetAcc.id, voucher_no: voucherNo, debit: 0, credit: purchaseCost, narration: `Removal of asset at cost: ${asset.asset_code}`, posting_date: disposalDate, reference_type: "ASSET_DISPOSAL", reference_id: id }
        ];

        if (disposalProceeds > 0) {
            glEntries.push({ company_id: companyId, account_id: cashAcc.id, voucher_no: voucherNo, debit: disposalProceeds, credit: 0, narration: `Disposal proceeds: ${asset.asset_code}`, posting_date: disposalDate, reference_type: "ASSET_DISPOSAL", reference_id: id });
        }

        const absGainLoss = Math.abs(gainOrLoss);
        if (absGainLoss > 0.01) {
            glEntries.push(gainOrLoss >= 0
                ? { company_id: companyId, account_id: gainLossAcc.id, voucher_no: voucherNo, debit: 0, credit: absGainLoss, narration: `Gain on disposal: ${asset.asset_code}`, posting_date: disposalDate, reference_type: "ASSET_DISPOSAL", reference_id: id }
                : { company_id: companyId, account_id: gainLossAcc.id, voucher_no: voucherNo, debit: absGainLoss, credit: 0, narration: `Loss on disposal: ${asset.asset_code}`, posting_date: disposalDate, reference_type: "ASSET_DISPOSAL", reference_id: id }
            );
        }

        await tx.generalLedger.createMany({ data: glEntries });

        await tx.assetLedger.create({
            data: {
                asset_id: id,
                transaction_type: "DISPOSAL",
                amount: disposalProceeds,
                narration: `Disposed at ${disposalProceeds}. Book Value: ${bookValue}. Gain/Loss: ${gainOrLoss}`
            }
        });

        await tx.assetAllocation.updateMany({
            where: { asset_id: id, status: "ACTIVE" },
            data: { status: "RETURNED", return_date: disposalDate }
        });

        return tx.asset.update({
            where: { id },
            data: { status: "DISPOSED", disposal_date: disposalDate, disposal_amount: disposalProceeds, current_book_value: 0 }
        });
    });
}

module.exports = { createAsset, listAssets, getAssetById, approveAsset, allocateAsset, runDepreciation, disposeAsset };
