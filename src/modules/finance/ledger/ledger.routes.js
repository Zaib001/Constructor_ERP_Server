"use strict";

const express = require("express");
const router = express.Router();
const ledgerController = require("./ledger.controller");

router.get("/", ledgerController.getLedgerEntries);
router.get("/trial-balance", ledgerController.getTrialBalance);

module.exports = router;
