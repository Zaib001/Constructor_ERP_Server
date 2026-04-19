"use strict";

const documentsService = require("./documents.service");
const logger = require("../../logger");

// Company Documents
async function getAllCompanyDocuments(req, res, next) {
    try {
        const actingCompanyId = req.user.company_id;
        const { page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;
        
        const result = await documentsService.getAllCompanyDocuments(req.user, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllCompanyDocuments:", err);
        next(err);
    }
}

async function getCompanyDocumentById(req, res, next) {
    try {
        const companyId = req.user.company_id;
        const document = await documentsService.getCompanyDocumentById(req.params.id, req.user);
        if (!document) return res.status(404).json({ success: false, message: "Company Document not found or access denied" });
        return res.status(200).json({ success: true, data: document });
    } catch (err) {
        logger.error("Error in getCompanyDocumentById:", err);
        next(err);
    }
}

async function createCompanyDocument(req, res, next) {
    try {
        const document = await documentsService.createCompanyDocument(req.body, req.user);
        return res.status(201).json({ success: true, data: document });
    } catch (err) {
        logger.error("Error in createCompanyDocument:", err);
        next(err);
    }
}

async function updateCompanyDocument(req, res, next) {
    try {
        const companyId = req.user.company_id;
        const document = await documentsService.updateCompanyDocument(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: document });
    } catch (err) {
        logger.error("Error in updateCompanyDocument:", err);
        next(err);
    }
}

async function deleteCompanyDocument(req, res, next) {
    try {
        const companyId = req.user.company_id;
        await documentsService.deleteCompanyDocument(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Company Document archived successfully" });
    } catch (err) {
        logger.error("Error in deleteCompanyDocument:", err);
        next(err);
    }
}

// Facility Documents
async function getAllFacilityDocuments(req, res, next) {
    try {
        const companyId = req.user.company_id;
        const { page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await documentsService.getAllFacilityDocuments(req.user, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllFacilityDocuments:", err);
        next(err);
    }
}

async function getFacilityDocumentById(req, res, next) {
    try {
        const companyId = req.user.company_id;
        const document = await documentsService.getFacilityDocumentById(req.params.id, req.user);
        if (!document) return res.status(404).json({ success: false, message: "Facility Document not found or access denied" });
        return res.status(200).json({ success: true, data: document });
    } catch (err) {
        logger.error("Error in getFacilityDocumentById:", err);
        next(err);
    }
}

async function createFacilityDocument(req, res, next) {
    try {
        const document = await documentsService.createFacilityDocument(req.body, req.user);
        return res.status(201).json({ success: true, data: document });
    } catch (err) {
        logger.error("Error in createFacilityDocument:", err);
        next(err);
    }
}

async function updateFacilityDocument(req, res, next) {
    try {
        const companyId = req.user.company_id;
        const document = await documentsService.updateFacilityDocument(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: document });
    } catch (err) {
        logger.error("Error in updateFacilityDocument:", err);
        next(err);
    }
}

async function deleteFacilityDocument(req, res, next) {
    try {
        const companyId = req.user.company_id;
        await documentsService.deleteFacilityDocument(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Facility Document archived successfully" });
    } catch (err) {
        logger.error("Error in deleteFacilityDocument:", err);
        next(err);
    }
}

module.exports = {
    getAllCompanyDocuments,
    getCompanyDocumentById,
    createCompanyDocument,
    updateCompanyDocument,
    deleteCompanyDocument,
    getAllFacilityDocuments,
    getFacilityDocumentById,
    createFacilityDocument,
    updateFacilityDocument,
    deleteFacilityDocument
};
