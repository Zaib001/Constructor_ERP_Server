"use strict";

const coaService = require("./coa.service");
const logger = require("../../../logger");

const getAccounts = async (req, res) => {
    try {
        const accounts = await coaService.getAccounts(req.user.company_id);
        res.json({ success: true, data: accounts });
    } catch (error) {
        logger.error("Error fetching COA:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createAccount = async (req, res) => {
    try {
        const account = await coaService.createAccount(req.user.company_id, req.body);
        res.status(201).json({ success: true, data: account });
    } catch (error) {
        logger.error("Error creating account:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateAccount = async (req, res) => {
    try {
        const account = await coaService.updateAccount(req.params.id, req.user.company_id, req.body);
        res.json({ success: true, data: account });
    } catch (error) {
        logger.error("Error updating account:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteAccount = async (req, res) => {
    try {
        await coaService.deleteAccount(req.params.id, req.user.company_id);
        res.json({ success: true, message: "Account deleted successfully" });
    } catch (error) {
        logger.error("Error deleting account:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAccounts,
    createAccount,
    updateAccount,
    deleteAccount
};
