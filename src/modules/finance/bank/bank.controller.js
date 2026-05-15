"use strict";

const bankService = require("./bank.service");
const logger = require("../../../logger");

const getBankAccounts = async (req, res) => {
    try {
        const accounts = await bankService.getBankAccounts(req.user.company_id);
        res.json({ success: true, data: accounts });
    } catch (error) {
        logger.error("Error fetching bank accounts:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createBankAccount = async (req, res) => {
    try {
        const account = await bankService.createBankAccount(req.user.company_id, req.body);
        res.status(201).json({ success: true, data: account });
    } catch (error) {
        logger.error("Error creating bank account:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateBankAccount = async (req, res) => {
    try {
        const account = await bankService.updateBankAccount(req.params.id, req.user.company_id, req.body);
        res.json({ success: true, data: account });
    } catch (error) {
        logger.error("Error updating bank account:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getBankAccounts,
    createBankAccount,
    updateBankAccount
};
