"use strict";

const companiesService = require("./companies.service");
const logger = require("../../logger");

async function getAllCompanies(req, res, next) {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const search = req.query.search || "";
        
        const result = await companiesService.getAllCompanies(req.user, page, pageSize, search);
        return res.status(200).json({ 
            success: true, 
            ...result
        });
    } catch (err) {
        logger.error("Error in getAllCompanies:", err);
        next(err);
    }
}

async function getCompanyById(req, res, next) {
    try {
        const company = await companiesService.getCompanyById(req.params.id, req.user);
        if (!company) return res.status(404).json({ success: false, message: "Company not found" });
        return res.status(200).json({ success: true, data: company });
    } catch (err) {
        logger.error("Error in getCompanyById:", err);
        next(err);
    }
}

async function createCompany(req, res, next) {
    try {
        const company = await companiesService.createCompany(req.body, req.user);
        return res.status(201).json({ success: true, data: company });
    } catch (err) {
        logger.error("Error in createCompany:", err);
        next(err);
    }
}

async function updateCompany(req, res, next) {
    try {
        const company = await companiesService.updateCompany(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: company });
    } catch (err) {
        logger.error("Error in updateCompany:", err);
        next(err);
    }
}

async function deleteCompany(req, res, next) {
    try {
        await companiesService.deleteCompany(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Company deactivated successfully" });
    } catch (err) {
        logger.error("Error in deleteCompany:", err);
        next(err);
    }
}

async function getDetailedPerformance(req, res, next) {
    try {
        const performance = await companiesService.getCompanyPerformance(req.params.id, req.user);
        if (!performance) return res.status(404).json({ success: false, message: "Company not found" });
        return res.status(200).json({ success: true, data: performance });
    } catch (err) {
        logger.error("Error in getDetailedPerformance:", err);
        next(err);
    }
}

module.exports = { getAllCompanies, getCompanyById, createCompany, updateCompany, deleteCompany, getDetailedPerformance };
