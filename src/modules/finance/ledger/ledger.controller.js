"use strict";

const ledgerService = require("./ledger.service");
const logger = require("../../../logger");

const getLedgerEntries = async (req, res) => {
    try {
        const entries = await ledgerService.getLedgerEntries(req.user.company_id, req.query);
        res.json({ success: true, data: entries });
    } catch (error) {
        logger.error("Error fetching ledger entries:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getTrialBalance = async (req, res) => {
    try {
        const data = await ledgerService.getTrialBalance(req.user.company_id, req.query);
        res.json({ success: true, data });
    } catch (error) {
        logger.error("Error generating trial balance:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getLedgerEntries,
    getTrialBalance
};
