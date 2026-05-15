"use strict";

const vouchersService = require("./vouchers.service");
const logger = require("../../../logger");

const getVouchers = async (req, res) => {
    try {
        const vouchers = await vouchersService.getVouchers(req.user.company_id, req.query);
        res.json({ success: true, data: vouchers });
    } catch (error) {
        logger.error("Error fetching vouchers:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createVoucher = async (req, res) => {
    try {
        const voucher = await vouchersService.createVoucher(req.user.company_id, req.body, req.user.id);
        res.status(201).json({ success: true, data: voucher });
    } catch (error) {
        logger.error("Error creating voucher:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const postVoucher = async (req, res) => {
    try {
        const voucher = await vouchersService.postVoucher(req.params.id, req.user.company_id, req.user.id);
        res.json({ success: true, data: voucher });
    } catch (error) {
        logger.error("Error posting voucher:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const reverseVoucher = async (req, res) => {
    try {
        const voucher = await vouchersService.reverseVoucher(req.params.id, req.user.company_id, req.user.id, req.body.reason);
        res.json({ success: true, data: voucher });
    } catch (error) {
        logger.error("Error reversing voucher:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getVouchers,
    createVoucher,
    postVoucher,
    reverseVoucher
};
