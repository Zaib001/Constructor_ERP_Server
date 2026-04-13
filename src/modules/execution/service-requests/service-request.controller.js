"use strict";

const svc = require("./service-request.service");

exports.listRequests = async (req, res) => {
  try {
    const data = await svc.listRequests(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const data = await svc.createRequest(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.submitAction = async (req, res) => {
  try {
    const { action } = req.body;
    let data;
    if (action === 'submit_approval') {
      data = await svc.submitForApproval(req.params.id, req.user);
    } else if (action === 'convert_to_pr') {
      data = await svc.convertToPR(req.params.id, req.user);
    } else {
      throw new Error("Invalid action.");
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
