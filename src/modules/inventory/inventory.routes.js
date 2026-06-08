"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./inventory.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");
const idempotent = require("../idempotency/idempotency.middleware");

// All routes require JWT
router.use(authenticateJWT);

// ─── GRN (Goods Receipt) ──────────────────────────────────────────────────────
// idempotent() middleware: if Idempotency-Key header is present, prevents duplicate GRNs.
router.post(
    "/grn",
    requirePermission("inventory.grn.create"),
    idempotent(),
    controller.postGRN
);

router.get(
    "/grn",
    requirePermission("inventory.read"),
    controller.getGRNs
);

// ─── Material Issue (Outbound) ────────────────────────────────────────────────
router.post(
    "/issue",
    requirePermission("inventory.issue.create"),
    controller.postMaterialIssue
);

router.get(
    "/issue",
    requirePermission("inventory.read"),
    controller.getIssues
);

// ─── Stock Snapshot ───────────────────────────────────────────────────────────
router.get(
    "/stock",
    requirePermission("inventory.read"),
    controller.getStock
);

// ─── Stock Ledger (Audit Trail) ───────────────────────────────────────────────
router.get(
    "/ledger/:itemId",
    requirePermission("inventory.read"),
    controller.getLedger
);

// ─── Material Requests (Site Engineer & Storekeeper) ──────────────────────────
router.post(
    "/requests",
    requirePermission("inventory.read"),
    controller.postMaterialRequest
);

router.get(
    "/requests",
    requirePermission("inventory.read"),
    controller.getMaterialRequests
);

// NOTE: This is an admin/emergency override endpoint.
// The canonical PM approval path is POST /api/approvals/:id/approve,
// which goes through the full approval engine (audit, steps, notifications).
// This raw endpoint exists for storekeeper confirmations and admin corrections.
router.put(
    "/requests/:id/status",
    requirePermission("inventory.issue.create"),
    controller.updateMaterialRequestStatus
);

router.post(
    "/requests/:id/issue",
    requirePermission("inventory.issue.create"),
    controller.issueRequestedMaterials
);

// ─── Legacy routes (non-breaking, existing UI depends on these) ───────────────
router.get(
    "/stores",
    requirePermission("inventory.read"),
    controller.getStores
);
router.post(
    "/stores",
    requirePermission("inventory.store.manage"),
    controller.createStore
);
router.put(
    "/stores/:id",
    requirePermission("inventory.store.manage"),
    controller.updateStore
);
router.delete(
    "/stores/:id",
    requirePermission("inventory.store.manage"),
    controller.deleteStore
);
router.post(
    "/stock",
    requirePermission("inventory.store.manage"),
    controller.addStock
);

module.exports = router;
