"use strict";

const svc = require("./allocation.service");

exports.getPendingRequirements = async (req, res) => {
  try {
    const data = await svc.getPendingRequirements(req.query.project_id, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createAllocation = async (req, res) => {
  try {
    const data = await svc.createAllocation(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.listAllocations = async (req, res) => {
  try {
    const data = await svc.listAllocations(req.query, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.generatePR = async (req, res) => {
  try {
    const { allocationId, quantity } = req.body;
    const data = await svc.generatePRFromAllocation(allocationId, quantity, req.user.id, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error("PR_GEN_ERROR:", err.message);
    res.status(400).json({ 
        success: false, 
        message: err.message || "Failed to generate Purchase Requisition" 
    });
  }
};
