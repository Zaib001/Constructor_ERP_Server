const express = require('express');
const router = express.Router();
const procurementController = require('./procurement.controller');
const authenticateJWT = require('../../middleware/authenticateJWT');
const requirePermission = require('../../middleware/requirePermission');

router.use(authenticateJWT);

router.get('/invoices', requirePermission('procurement.po.read'), procurementController.listInvoices);

module.exports = router;
