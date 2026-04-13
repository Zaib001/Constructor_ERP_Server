"use strict";

const vehiclesService = require("./vehicles.service");
const logger = require("../../logger");

async function getAllVehicles(req, res, next) {
    try {
        const { runningSite, departmentId, page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await vehiclesService.getAllVehicles(req.user, runningSite, departmentId, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllVehicles:", err);
        next(err);
    }
}

async function getVehicleById(req, res, next) {
    try {
        const vehicle = await vehiclesService.getVehicleById(req.params.id, req.user);
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found or access denied" });
        return res.status(200).json({ success: true, data: vehicle });
    } catch (err) {
        logger.error("Error in getVehicleById:", err);
        next(err);
    }
}

async function createVehicle(req, res, next) {
    try {
        const vehicle = await vehiclesService.createVehicle(req.body, req.user);
        return res.status(201).json({ success: true, data: vehicle });
    } catch (err) {
        logger.error("Error in createVehicle:", err);
        next(err);
    }
}

async function updateVehicle(req, res, next) {
    try {
        const vehicle = await vehiclesService.updateVehicle(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: vehicle });
    } catch (err) {
        logger.error("Error in updateVehicle:", err);
        next(err);
    }
}

async function deleteVehicle(req, res, next) {
    try {
        await vehiclesService.deleteVehicle(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Vehicle archived successfully" });
    } catch (err) {
        logger.error("Error in deleteVehicle:", err);
        next(err);
    }
}

module.exports = {
    getAllVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle
};
