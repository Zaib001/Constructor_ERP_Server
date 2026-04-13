"use strict";

const equipmentService = require("./equipment.service");
const logger = require("../../logger");

async function getAllEquipment(req, res, next) {
    try {
        const { runningSite, departmentId, page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await equipmentService.getAllEquipment(req.user, runningSite, departmentId, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllEquipment:", err);
        next(err);
    }
}

async function getEquipmentById(req, res, next) {
    try {
        const equipment = await equipmentService.getEquipmentById(req.params.id, req.user);
        if (!equipment) return res.status(404).json({ success: false, message: "Equipment not found or access denied" });
        return res.status(200).json({ success: true, data: equipment });
    } catch (err) {
        logger.error("Error in getEquipmentById:", err);
        next(err);
    }
}

async function createEquipment(req, res, next) {
    try {
        const equipment = await equipmentService.createEquipment(req.body, req.user);
        return res.status(201).json({ success: true, data: equipment });
    } catch (err) {
        logger.error("Error in createEquipment:", err);
        next(err);
    }
}

async function updateEquipment(req, res, next) {
    try {
        const equipment = await equipmentService.updateEquipment(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: equipment });
    } catch (err) {
        logger.error("Error in updateEquipment:", err);
        next(err);
    }
}

async function deleteEquipment(req, res, next) {
    try {
        await equipmentService.deleteEquipment(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Equipment archived successfully" });
    } catch (err) {
        logger.error("Error in deleteEquipment:", err);
        next(err);
    }
}

module.exports = {
    getAllEquipment,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment
};
