"use strict";

const itemsService = require("./items.service");
const logger = require("../../logger");

async function getAllItems(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const { page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await itemsService.getAllItems(req.user, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllItems:", err);
        next(err);
    }
}

async function getItemById(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const item = await itemsService.getItemById(req.params.id, req.user);
        if (!item) return res.status(404).json({ success: false, message: "Item not found or access denied" });
        return res.status(200).json({ success: true, data: item });
    } catch (err) {
        logger.error("Error in getItemById:", err);
        next(err);
    }
}

async function createItem(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const item = await itemsService.createItem(req.body, req.user);
        return res.status(201).json({ success: true, data: item });
    } catch (err) {
        logger.error("Error in createItem:", err);
        next(err);
    }
}

async function updateItem(req, res, next) {
    try {
        const companyId = req.user.companyId;
        const item = await itemsService.updateItem(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: item });
    } catch (err) {
        logger.error("Error in updateItem:", err);
        next(err);
    }
}

async function deleteItem(req, res, next) {
    try {
        const companyId = req.user.companyId;
        await itemsService.deleteItem(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Item archived successfully" });
    } catch (err) {
        logger.error("Error in deleteItem:", err);
        next(err);
    }
}

module.exports = {
    getAllItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem
};
