"use strict";

const express = require("express");
const router = express.Router();
const purchaseOrdersController = require("./purchaseOrders.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/", requirePermission("procurement.po.read"), purchaseOrdersController.getAllPurchaseOrders);
router.post("/", requirePermission("procurement.po.create"), purchaseOrdersController.createPO);
router.post("/payment", requirePermission("procurement.po.update"), purchaseOrdersController.processPayment); // Global payment endpoint or PO specific? I'll add specific ones too

router.get("/:id", requirePermission("procurement.po.read"), purchaseOrdersController.getPOById);
router.post("/:id/issue", requirePermission("procurement.po.issue"), purchaseOrdersController.issuePO);
router.post("/:id/receipt", requirePermission("procurement.po.update"), purchaseOrdersController.recordReceipt);
router.get("/:id/receipts", requirePermission("procurement.po.read"), purchaseOrdersController.getReceiptsByPO);
router.post("/:id/invoice", requirePermission("procurement.po.update"), purchaseOrdersController.createInvoice);
router.get("/:id/invoices", requirePermission("procurement.po.read"), purchaseOrdersController.getInvoicesByPO);

module.exports = router;
