"use strict";

const service = require("./creditNotes.service");

const getNotes = async (req, res, next) => {
    try {
        const data = await service.getCreditNotes(req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

const createNote = async (req, res, next) => {
    try {
        const data = await service.createCreditNote(req.user.companyId, req.body, req.user.id);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
};

const postNote = async (req, res, next) => {
    try {
        const data = await service.postCreditNote(req.params.id, req.user.companyId, req.user.id);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

module.exports = { getNotes, createNote, postNote };
