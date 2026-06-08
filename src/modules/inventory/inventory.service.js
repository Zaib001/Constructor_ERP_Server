"use strict";

const prisma = require("../../db");
const { applyDataScope, MODULES, validateResourceAccess } = require("../../utils/scoping");
const { logAudit } = require("../../utils/auditLogger");
const { updateCostCodeActual, recomputeProjectProgress } = require("../wbs/wbs.service");
const { registerAdapter } = require("../approvals/approvals.adapter");
const { requestApproval } = require("../approvals/approvals.service");

// ─── MR Approval Adapter ─────────────────────────────────────────────────────
// Called by the approval engine when the PM approves/rejects a Material Request.
// Maps approval outcome → reservation_status on the InventoryPlanningRequest.
registerAdapter("MR", async ({ docId, status }) => {
    let reservationStatus;
    if (status === "approved")            reservationStatus = "RESERVED";
    else if (status === "rejected")        reservationStatus = "CANCELLED";
    else if (status === "cancelled")       reservationStatus = "CANCELLED";
    else if (status === "sent_back")       reservationStatus = "PENDING";   // engineer must resubmit
    else return; // no-op for other statuses (in_approval, in_progress)

    await prisma.inventoryPlanningRequest.update({
        where: { id: docId },
        data: { reservation_status: reservationStatus }
    });
});

// ─── AppError ────────────────────────────────────────────────────────────────
class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Generate a sequential GRN number using DB row count + timestamp suffix.
 * Format: GRN-YYYYMMDD-NNNN  (collision-safe within the transaction)
 */
async function _generateGrnNo(tx, companyId) {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, "");
    const count = await tx.goodsReceiptNote.count({ where: { company_id: companyId } });
    return `GRN-${datePart}-${String(count + 1).padStart(4, "0")}`;
}

async function _generateIssueNo(tx, companyId) {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, "");
    const count = await tx.materialIssue.count({ where: { company_id: companyId } });
    return `ISS-${datePart}-${String(count + 1).padStart(4, "0")}`;
}

async function _scopedFind(tx, model, id, companyId, extraWhere = {}) {
    const where = { id, ...extraWhere };
    
    // Some models (WBS, CostCode) scope through their parents instead of direct company_id
    if (model === "wBS") {
        where.project = { company_id: companyId };
    } else if (model === "costCode") {
        where.wbs = { project: { company_id: companyId } };
    } else {
        where.company_id = companyId;
    }

    const record = await tx[model].findFirst({ where });
    if (!record) throw new AppError(`${model} not found or access denied`, 404);
    return record;
}

// ─── createGRN ───────────────────────────────────────────────────────────────
/**
 * Create a Goods Receipt Note against an approved PO.
 *
 * Transaction boundaries:
 *   1. Validate all resources belong to caller's company
 *   2. Validate each GRN item matches the corresponding PO item
 *   3. Block over-receiving per line
 *   4. Create GRN header + items
 *   5. Increment PurchaseOrderItem.received_quantity (atomic)
 *   6. Upsert InventoryStock (atomic increment)
 *   7. Append StockLedger entry (quantity always positive; move_type = GRN_IN)
 *   8. Update PO delivery_status
 *   9. Write audit log (outside tx — non-blocking)
 */
async function createGRN(data, user, ipAddress, deviceInfo) {
    const { poId, storeId, vendorDn, remarks, items } = data;
    
    // Validate write access to target records
    await validateResourceAccess(prisma, "purchaseOrder", poId, user, { module: MODULES.PROCUREMENT, isWrite: true });
    await validateResourceAccess(prisma, "store", storeId, user, { module: MODULES.INVENTORY, isWrite: true });
    
    const { companyId, id: userId } = user;

    const grn = await prisma.$transaction(async (tx) => {
        // ── 1. Validate PO ─────────────────────────────────────────────────
        const po = await _scopedFind(tx, "purchaseOrder", poId, companyId, { status: "issued" });

        // ── 2. Validate Store ───────────────────────────────────────────────
        await _scopedFind(tx, "store", storeId, companyId);

        // ── 3. Load full PO items map ───────────────────────────────────────
        const poItems = await tx.purchaseOrderItem.findMany({
            where: { purchase_order_id: po.id }
        });
        const poItemMap = new Map(poItems.map((i) => [i.id, i]));

        // ── 4. Validate each incoming GRN line ──────────────────────────────
        for (const line of items) {
            const poItem = poItemMap.get(line.poItemId);
            if (!poItem) {
                throw new AppError(`PO item ${line.poItemId} not found in PO ${po.po_number}`, 422);
            }

            // PO item ↔ Item consistency: if PO line has item_id, it must match
            if (poItem.item_id && poItem.item_id !== line.itemId) {
                throw new AppError(
                    `Item mismatch on PO line ${line.poItemId}: expected ${poItem.item_id}, got ${line.itemId}`,
                    422
                );
            }

            // Item must belong to company (if it exists in catalog)
            if (line.itemId) {
                await _scopedFind(tx, "item", line.itemId, companyId);
            }

            // Over-receiving check — use Decimal arithmetic (Prisma returns Decimal)
            const alreadyReceived = poItem.received_quantity ?? 0;
            const remaining = parseFloat(poItem.quantity) - parseFloat(alreadyReceived);
            if (parseFloat(line.qtyReceived) > remaining + 1e-9) {
                throw new AppError(
                    `Over-receiving on "${poItem.item_name}": remaining ${remaining}, attempted ${line.qtyReceived}`,
                    422
                );
            }
        }

        // ── 5. Create GRN Header ────────────────────────────────────────────
        const grnNo = await _generateGrnNo(tx, companyId);
        const grnRecord = await tx.goodsReceiptNote.create({
            data: {
                grn_no: grnNo,
                company_id: companyId,
                po_id: poId,
                store_id: storeId,
                received_by: userId,
                vendor_dn: vendorDn || null,
                remarks: remarks || null
            }
        });

        // ── 6. Process each line ────────────────────────────────────────────
        for (const line of items) {
            const poItem = poItemMap.get(line.poItemId);

            // Create GRN Item
            await tx.gRNItem.create({
                data: {
                    grn: { connect: { id: grnRecord.id } },
                    po_item: { connect: { id: line.poItemId } },
                    item: line.itemId ? { connect: { id: line.itemId } } : undefined,
                    qty_received: line.qtyReceived,
                    qty_rejected: line.qtyRejected ?? 0,
                    unit_price: poItem.unit_price // captured from PO — no user input
                }
            });

            // Accepted quantity = received − rejected
            const acceptedQty = parseFloat(line.qtyReceived) - parseFloat(line.qtyRejected ?? 0);
            if (acceptedQty <= 0 || !line.itemId) continue; // nothing to stock if all rejected OR no catalog ID

            // Atomic PO item received_quantity increment
            await tx.purchaseOrderItem.update({
                where: { id: line.poItemId },
                data: { received_quantity: { increment: acceptedQty } }
            });

            // Atomic InventoryStock upsert
            await tx.inventoryStock.upsert({
                where: { store_id_item_id: { store_id: storeId, item_id: line.itemId } },
                update: { quantity: { increment: acceptedQty } },
                create: {
                    company_id: companyId,
                    store_id: storeId,
                    item_id: line.itemId,
                    quantity: acceptedQty
                }
            });

            // StockLedger — quantity is ALWAYS positive; move_type defines direction
            await tx.stockLedger.create({
                data: {
                    company_id: companyId,
                    item_id: line.itemId,
                    store_id: storeId,
                    move_type: "GRN_IN",
                    quantity: acceptedQty,
                    reference_id: grnRecord.id,
                    created_by: userId
                }
            });
        }

        // ── 7. Re-fetch all PO items to determine delivery status ───────────
        const refreshed = await tx.purchaseOrderItem.findMany({
            where: { purchase_order_id: poId }
        });
        const deliveryStatus = refreshed.every(
            (i) => parseFloat(i.received_quantity ?? 0) >= parseFloat(i.quantity) - 1e-9
        )
            ? "complete"
            : "partial";

        await tx.purchaseOrder.update({
            where: { id: poId },
            data: { delivery_status: deliveryStatus }
        });

        return grnRecord;
    });

    // ── 8. Audit (outside tx — non-blocking) ─────────────────────────────
    logAudit({
        userId,
        module: "inventory",
        entity: "grn",
        entityId: grn.id,
        action: "CREATE_GRN",
        afterData: { grnNo: grn.grn_no, poId, storeId, lineCount: items.length },
        ipAddress,
        deviceInfo
    });

    return grn;
}

// ─── createMaterialIssue ─────────────────────────────────────────────────────
/**
 * Issue material from warehouse to project site.
 *
 * Transaction boundaries:
 *   1. Validate project, WBS, store belong to company
 *   2. For each item: validate item and costCode belong to company
 *   3. Check available stock — block if insufficient
 *   4. Create MaterialIssue header + items
 *   5. Decrement InventoryStock (atomic)
 *   6. Append StockLedger entry (quantity positive; move_type = ISSUE_OUT)
 *   7. Increment CostCode.actual_amount
 */
async function createMaterialIssue(data, user, ipAddress, deviceInfo) {
    const { projectId, wbsId, storeId, items } = data;
    
    // Validate write access to target records
    await validateResourceAccess(prisma, "project", projectId, user, { module: MODULES.PROJECTS, isWrite: false }); // Reading project context
    await validateResourceAccess(prisma, "store", storeId, user, { module: MODULES.INVENTORY, isWrite: true });
    
    const { companyId, id: userId } = user;

    const issue = await prisma.$transaction(async (tx) => {
        // ── 1. Validate top-level resources ────────────────────────────────
        await _scopedFind(tx, "project", projectId, companyId);
        await _scopedFind(tx, "wBS", wbsId, companyId);      // Prisma model name is 'wBS' (mapped)
        await _scopedFind(tx, "store", storeId, companyId);

        // ── 2. Validate all items before writing anything ───────────────────
        for (const line of items) {
            await _scopedFind(tx, "item", line.itemId, companyId);
            await _scopedFind(tx, "costCode", line.costCodeId, companyId);

            const stock = await tx.inventoryStock.findUnique({
                where: { store_id_item_id: { store_id: storeId, item_id: line.itemId } }
            });
            const available = parseFloat(stock?.quantity ?? 0);
            if (available < parseFloat(line.quantity) - 1e-9) {
                const item = await tx.item.findUnique({ where: { id: line.itemId }, select: { name: true } });
                throw new AppError(
                    `Insufficient stock for "${item?.name ?? line.itemId}": available ${available}, requested ${line.quantity}`,
                    422
                );
            }
        }

        // ── 3. Create Issue Header ──────────────────────────────────────────
        const issueNo = await _generateIssueNo(tx, companyId);
        const issueRecord = await tx.materialIssue.create({
            data: {
                issue_no: issueNo,
                company_id: companyId,
                project_id: projectId,
                wbs_id: wbsId,
                store_id: storeId,
                issued_by: userId
            }
        });

        // ── 4. Process each line ────────────────────────────────────────────
        for (const line of items) {
            // Derive unit cost from item's standard price; fallback 0 (safe assumption)
            const itemMaster = await tx.item.findUnique({
                where: { id: line.itemId },
                select: { standard_price: true }
            });
            const unitCost = parseFloat(itemMaster?.standard_price ?? 0);

            await tx.materialIssueItem.create({
                data: {
                    issue_id: issueRecord.id,
                    item_id: line.itemId,
                    quantity: line.quantity,
                    unit_cost: unitCost,
                    cost_code_id: line.costCodeId
                }
            });

            // Atomic stock decrement
            await tx.inventoryStock.update({
                where: { store_id_item_id: { store_id: storeId, item_id: line.itemId } },
                data: { quantity: { decrement: line.quantity } }
            });

            // StockLedger — quantity is ALWAYS positive; move_type = ISSUE_OUT
            await tx.stockLedger.create({
                data: {
                    company_id: companyId,
                    item_id: line.itemId,
                    store_id: storeId,
                    move_type: "ISSUE_OUT",
                    quantity: parseFloat(line.quantity), // positive
                    reference_id: issueRecord.id,
                    created_by: userId
                }
            });

            // Update CostCode actual_amount
            const costImpact = parseFloat(line.quantity) * unitCost;
            if (costImpact > 0) {
                await updateCostCodeActual(tx, null, 'material', costImpact, line.costCodeId);
            }
        }

        // Recompute project progress after material consumption impacts
        await recomputeProjectProgress(tx, projectId);

        return issueRecord;
    });

    // ── 5. Audit ──────────────────────────────────────────────────────────
    logAudit({
        userId,
        module: "inventory",
        entity: "material_issue",
        entityId: issue.id,
        action: "CREATE_ISSUE",
        afterData: { issueNo: issue.issue_no, projectId, wbsId, storeId, lineCount: items.length },
        ipAddress,
        deviceInfo
    });

    return issue;
}

// ─── getStockSnapshot ─────────────────────────────────────────────────────────
async function getStockSnapshot(user, filters = {}) {
    const { storeId, itemId, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.INVENTORY, isWrite: false, noSoftDelete: true });

    if (storeId) where.store_id = storeId;
    if (itemId) where.item_id = itemId;

    const [data, total] = await Promise.all([
        prisma.inventoryStock.findMany({
            where,
            include: {
                item: { select: { id: true, name: true, unit: true, category: true } },
                store: { select: { id: true, name: true, location: true } }
            },
            orderBy: [{ store_id: "asc" }, { item_id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.inventoryStock.count({ where })
    ]);

    return { data, total, page, pageSize };
}

// ─── getStockLedger ───────────────────────────────────────────────────────────
async function getStockLedger(user, itemId, filters = {}) {
    const { storeId, moveType, page = 1, pageSize = 50 } = filters;
    const where = applyDataScope(user, { module: MODULES.INVENTORY, isWrite: false, noSoftDelete: true });

    where.item_id = itemId;
    if (storeId) where.store_id = storeId;
    if (moveType) where.move_type = moveType;

    const [data, total] = await Promise.all([
        prisma.stockLedger.findMany({
            where,
            include: {
                store: { select: { id: true, name: true } },
                item: { select: { id: true, name: true, unit: true } }
            },
            orderBy: { created_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.stockLedger.count({ where })
    ]);

    return { data, total, page, pageSize };
}

// ─── getGRNList ───────────────────────────────────────────────────────────────
async function getGRNList(user, filters = {}) {
    const { poId, storeId, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.INVENTORY, isWrite: false, noSoftDelete: true });

    if (poId) where.po_id = poId;
    if (storeId) where.store_id = storeId;

    const [data, total] = await Promise.all([
        prisma.goodsReceiptNote.findMany({
            where,
            include: {
                po: { select: { id: true, po_number: true, status: true } },
                store: { select: { id: true, name: true } },
                receiver: { select: { id: true, name: true } },
                items: {
                    include: { item: { select: { id: true, name: true, unit: true } } }
                }
            },
            orderBy: { received_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.goodsReceiptNote.count({ where })
    ]);

    return { data, total, page, pageSize };
}

// ─── getIssueList ─────────────────────────────────────────────────────────────
async function getIssueList(user, filters = {}) {
    const { projectId, wbsId, storeId, page = 1, pageSize = 20 } = filters;
    const where = applyDataScope(user, { module: MODULES.INVENTORY, isWrite: false, noSoftDelete: true });

    if (projectId) where.project_id = projectId;
    if (wbsId) where.wbs_id = wbsId;
    if (storeId) where.store_id = storeId;

    const [data, total] = await Promise.all([
        prisma.materialIssue.findMany({
            where,
            include: {
                project: { select: { id: true, name: true, code: true } },
                wbs: { select: { id: true, name: true, wbs_code: true } },
                store: { select: { id: true, name: true } },
                issuer: { select: { id: true, name: true } },
                items: {
                    include: {
                        item: { select: { id: true, name: true, unit: true } },
                        cost_code: { select: { id: true, category: true } }
                    }
                }
            },
            orderBy: { issued_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.materialIssue.count({ where })
    ]);

    return { data, total, page, pageSize };
}

// ─── Legacy stubs (kept for existing routes — non-breaking) ──────────────────
async function getStock(user, page = 1, pageSize = 20) {
    return getStockSnapshot(user, { page, pageSize });
}

async function getPRs(user, projectId, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const scopeWhere = applyDataScope(user, { projectFilter: true });
    const where = {
        ...scopeWhere,
        ...(projectId ? { project_id: projectId } : {})
    };
    const [data, total] = await Promise.all([
        prisma.purchaseRequisition.findMany({
            where, skip, take: pageSize,
            orderBy: { created_at: "desc" },
            include: { project: { select: { id: true, name: true } } }
        }),
        prisma.purchaseRequisition.count({ where })
    ]);
    return { data, total, page, pageSize };
}

async function getExcess(user, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const { companyId } = user;

    const [data, total] = await Promise.all([
        prisma.excessMaterial.findMany({
            where: { company_id: companyId },
            include: { item: { select: { id: true, name: true, unit: true } } },
            orderBy: { created_at: "desc" },
            skip,
            take: pageSize
        }),
        prisma.excessMaterial.count({ where: { company_id: companyId } })
    ]);

    return { data, total, page, pageSize };
}

async function getStores(user) {
    const where = applyDataScope(user, { module: MODULES.INVENTORY, isWrite: false });
    where.is_active = true;
    
    return await prisma.store.findMany({
        where,
        include: {
            store_keeper: { select: { id: true, name: true } }
        },
        orderBy: { name: "asc" }
    });
}

async function createStore(user, data) {
    const { companyId } = user;
    const { name, location, description, storeKeeperId } = data;

    if (!name) throw new AppError("Store name is required", 400);

    return await prisma.store.create({
        data: {
            company_id: companyId,
            name,
            location,
            description,
            store_keeper_id: storeKeeperId || null,
            is_active: true
        },
        include: {
            store_keeper: { select: { id: true, name: true } }
        }
    });
}

async function updateStore(user, id, data) {
    const { companyId } = user;
    const { name, location, description, storeKeeperId } = data;

    // Verify ownership before update
    return await prisma.store.update({
        where: { id, company_id: companyId },
        data: {
            name,
            location,
            description,
            store_keeper_id: storeKeeperId || null
        },
        include: {
            store_keeper: { select: { id: true, name: true } }
        }
    });
}

async function deleteStore(user, id) {
    const { companyId } = user;
    return await prisma.store.deleteMany({
        where: { id, company_id: companyId }
    });
}

async function addStock(user, data) {
    const { item_id, store_id, quantity } = data;
    const { companyId } = user;

    if (!item_id || !store_id) {
        throw new AppError("item_id and store_id are required", 400);
    }

    const qty = parseFloat(quantity) || 0;

    return await prisma.inventoryStock.upsert({
        where: { store_id_item_id: { store_id, item_id } },
        update: { quantity: { increment: qty } },
        create: {
            company_id: companyId,
            store_id,
            item_id,
            quantity: qty,
        },
        include: { item: { select: { id: true, name: true, unit: true } } }
    });
}

async function createPR(user, data) {
    return prisma.purchaseRequisition.create({
        data: {
            pr_no: data.pr_no || `PC-${Date.now()}`,
            project_id: data.project_id || null,
            company_id: user.companyId,
            requested_by: user.id,
            reason: data.job_reference || null,
            status: data.status || "draft"
        }
    });
}

async function reportExcess(user, data) {
    const { item_id, excess_quantity, pr_no, inspection_id } = data;
    const { companyId } = user;

    return await prisma.excessMaterial.create({
        data: {
            company_id: companyId,
            item_id,
            excess_quantity: parseFloat(excess_quantity),
            pr_no,
            inspection_id
        },
        include: { item: { select: { name: true } } }
    });
}

// ─── Material Requests (Site Engineer & Storekeeper) ───────────────────────

/**
 * Create a new Material Request (Reservation)
 */
async function createMaterialRequest(data, user) {
    const { projectId, wbsId, itemId, storeId, quantity, requiredDate } = data;
    const { companyId, id: userId } = user;

    // Validate access
    await validateResourceAccess(prisma, "project", projectId, user, { module: MODULES.PROJECTS, isWrite: false });

    const request = await prisma.$transaction(async (tx) => {
        // Validate scope
        await _scopedFind(tx, "project", projectId, companyId);
        await _scopedFind(tx, "wBS", wbsId, companyId);
        await _scopedFind(tx, "item", itemId, companyId);
        if (storeId) {
            await _scopedFind(tx, "store", storeId, companyId);
        }

        return await tx.inventoryPlanningRequest.create({
            data: {
                company_id: companyId,
                project_id: projectId,
                wbs_id: wbsId,
                wBSId: wbsId,
                item_id: itemId,
                store_id: storeId || null,
                quantity: Number(quantity),
                required_date: requiredDate ? new Date(requiredDate) : null,
                reservation_status: "PENDING",
                created_by: userId,
                status: "draft"
            },
            include: {
                project: { select: { name: true } },
                item: { select: { name: true, unit: true, category: true } },
                store: { select: { name: true } }
            }
        });
    });

    // ── Submit to Approval Engine ───────────────────────────────────────────
    // This creates an ApprovalRequest (docType="MR") so the PM sees it in their inbox.
    // Non-fatal: if approval submission fails (e.g. missing matrix), the MR is still
    // created but stays PENDING until manually submitted for approval.
    try {
        await requestApproval(
            {
                docType: "MR",
                docId: request.id,
                projectId,
                amount: 0,
                companyId
            },
            userId,
            null,
            null
        );
    } catch (approvalErr) {
        // Log but do not fail the MR creation — the engineer can resubmit via
        // POST /api/approvals/request if the matrix is missing.
        const logger = require("../../logger");
        logger.warn(`[MR] Approval submission failed for MR ${request.id}: ${approvalErr.message}`);
    }

    return request;
}

/**
 * List Material Requests with Scoping
 */
async function getMaterialRequestList(user, filters) {
    const where = applyDataScope(user, { projectFilter: true });
    const { projectId, storeId, reservationStatus, page = 1, pageSize = 20 } = filters;

    const finalWhere = {
        ...where,
        company_id: user.companyId,
        ...(projectId && { project_id: projectId }),
        ...(storeId && { store_id: storeId }),
        ...(reservationStatus && { reservation_status: reservationStatus })
    };

    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
        prisma.inventoryPlanningRequest.findMany({
            where: finalWhere,
            skip,
            take: pageSize,
            orderBy: { required_date: "asc" },
            include: {
                project: { select: { name: true } },
                item: { select: { name: true, unit: true, category: true, standard_price: true } },
                store: { select: { name: true } }
            }
        }),
        prisma.inventoryPlanningRequest.count({ where: finalWhere })
    ]);

    return {
        data,
        pagination: {
            total,
            page,
            pageSize,
            pages: Math.ceil(total / pageSize)
        }
    };
}

/**
 * Update reservation status directly (Approve / Reject / Cancel)
 */
async function updateMaterialRequestStatus(id, status, user) {
    const { companyId } = user;

    // Check request exists and belongs to company
    const request = await prisma.inventoryPlanningRequest.findFirst({
        where: { id, company_id: companyId }
    });
    if (!request) {
        throw new AppError("Material request not found or access denied", 404);
    }

    const updated = await prisma.inventoryPlanningRequest.update({
        where: { id },
        data: { reservation_status: status },
        include: {
            project: { select: { name: true } },
            item: { select: { name: true, unit: true, category: true } },
            store: { select: { name: true } }
        }
    });

    return updated;
}

/**
 * Fulfill a Material Request by creating a Material Issue and updating status to ISSUED
 */
async function fulfillMaterialRequest(id, data, user, ipAddress, deviceInfo) {
    const { storeId, costCodeId } = data;
    const { companyId, id: userId } = user;

    // Verify access to store
    await validateResourceAccess(prisma, "store", storeId, user, { module: MODULES.INVENTORY, isWrite: true });

    const result = await prisma.$transaction(async (tx) => {
        // ── 1. Load and lock request ──────────────────────────────────────────
        const request = await tx.inventoryPlanningRequest.findFirst({
            where: { id, company_id: companyId }
        });
        if (!request) {
            throw new AppError("Material request not found or access denied", 404);
        }

        if (request.reservation_status === "ISSUED") {
            throw new AppError("Material request has already been issued", 400);
        }

        // ── Pre-issuance status gate ────────────────────────────────────────────
        // The MR must be RESERVED (PM-approved via the approval engine) before
        // the storekeeper can fulfil it. A PENDING or CANCELLED MR cannot be issued.
        if (request.reservation_status !== "RESERVED") {
            throw new AppError(
                `Material request cannot be issued: current status is '${request.reservation_status}'. ` +
                `The request must be approved by the Project Manager first (status must be 'RESERVED').`,
                422
            );
        }

        // ── 2. Validate supporting resources ──────────────────────────────────
        await _scopedFind(tx, "project", request.project_id, companyId);
        const wbsId = request.wbs_id || request.wBSId;
        if (!wbsId) {
            throw new AppError("Material request WBS is not set", 400);
        }
        await _scopedFind(tx, "wBS", wbsId, companyId);
        await _scopedFind(tx, "store", storeId, companyId);
        await _scopedFind(tx, "item", request.item_id, companyId);
        await _scopedFind(tx, "costCode", costCodeId, companyId);

        // ── 3. Check stock availability ───────────────────────────────────────
        const stock = await tx.inventoryStock.findUnique({
            where: { store_id_item_id: { store_id: storeId, item_id: request.item_id } }
        });
        const available = parseFloat(stock?.quantity ?? 0);
        const reqQty = parseFloat(request.quantity);
        if (available < reqQty - 1e-9) {
            const item = await tx.item.findUnique({ where: { id: request.item_id }, select: { name: true } });
            throw new AppError(
                `Insufficient stock for "${item?.name ?? request.item_id}" in store: available ${available}, requested ${reqQty}`,
                422
            );
        }

        // ── 4. Generate issue sequential code and create MaterialIssue ────────
        const issueNo = await _generateIssueNo(tx, companyId);
        const issueRecord = await tx.materialIssue.create({
            data: {
                issue_no: issueNo,
                company_id: companyId,
                project_id: request.project_id,
                wbs_id: wbsId,
                store_id: storeId,
                issued_by: userId
            }
        });

        // ── 5. Create MaterialIssueItem ───────────────────────────────────────
        const itemMaster = await tx.item.findUnique({
            where: { id: request.item_id },
            select: { standard_price: true }
        });
        const unitCost = parseFloat(itemMaster?.standard_price ?? 0);

        await tx.materialIssueItem.create({
            data: {
                issue_id: issueRecord.id,
                item_id: request.item_id,
                cost_code_id: costCodeId,
                quantity: reqQty,
                unit_cost: unitCost,
            }
        });

        // ── 6. Decrement stock ────────────────────────────────────────────────
        await tx.inventoryStock.update({
            where: { store_id_item_id: { store_id: storeId, item_id: request.item_id } },
            data: { quantity: { decrement: reqQty } }
        });

        // ── 7. Stock ledger entry ─────────────────────────────────────────────
        await tx.stockLedger.create({
            data: {
                company_id: companyId,
                store_id: storeId,
                item_id: request.item_id,
                move_type: "ISSUE_OUT",
                quantity: reqQty,
                reference_id: issueRecord.id,
                reference_type: "material_issue",
                created_by: userId,
            }
        });

        // ── 8. Mark request as ISSUED ─────────────────────────────────────────
        const updatedRequest = await tx.inventoryPlanningRequest.update({
            where: { id },
            data: { reservation_status: "ISSUED" },
            include: { store: { select: { name: true } } }
        });

        return { issue: issueRecord, request: updatedRequest };
    });

    return result;
}

async function updateStock(user, id, data) {
    const { companyId } = user;
    const stock = await prisma.inventoryStock.findFirst({ where: { id, company_id: companyId } });
    if (!stock) throw new AppError("Stock record not found", 404);
    return prisma.inventoryStock.update({ where: { id }, data });
}

module.exports = {
    getPRs,
    getExcess,
    createGRN,
    getGRNList,
    createMaterialIssue,
    getIssueList,
    getStockSnapshot,
    getStockLedger,
    getStock,
    getStores,
    createStore,
    updateStore,
    deleteStore,
    addStock,
    updateStock,
    createPR,
    reportExcess,
    createMaterialRequest,
    getMaterialRequestList,
    updateMaterialRequestStatus,
    fulfillMaterialRequest,
};
