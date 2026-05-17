"use strict";

const service = require("./zatca.service");

const submitInvoice = async (req, res, next) => {
    try {
        const sub = await service.enqueueInvoiceSubmission(req.params.invoiceId, req.user.companyId, req.user.id);
        // Process synchronously to provide immediate response on direct click
        const result = await service.processSubmission(sub.id);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
};

const retrySubmission = async (req, res, next) => {
    try {
        const result = await service.retrySubmission(req.params.id, req.user.companyId, req.user.id);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
};

const getSubmissions = async (req, res, next) => {
    try {
        const result = await service.getSubmissions(req.user.companyId, {
            status: req.query.status,
            search: req.query.search,
            page:   parseInt(req.query.page)  || 1,
            limit:  parseInt(req.query.limit) || 20
        });
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
};

const getSubmissionLogs = async (req, res, next) => {
    try {
        const data = await service.getSubmissionLogs(req.params.id, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const onboardCompany = async (req, res, next) => {
    try {
        const config = await service.onboardZATCA(req.user.companyId, req.body, req.user.id);
        res.json({ success: true, data: config });
    } catch (err) { next(err); }
};

const rotateCertificates = async (req, res, next) => {
    try {
        const config = await service.rotateZATCACertificate(req.user.companyId, req.user.id);
        res.json({ success: true, data: config });
    } catch (err) { next(err); }
};

const getSettings = async (req, res, next) => {
    try {
        const config = await service.getZATCAConfig(req.user.companyId);
        res.json({ success: true, data: config });
    } catch (err) { next(err); }
};

module.exports = { 
    submitInvoice, 
    retrySubmission, 
    getSubmissions, 
    getSubmissionLogs,
    onboardCompany,
    rotateCertificates,
    getSettings
};
