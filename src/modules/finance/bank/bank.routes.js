"use strict";

const express = require("express");
const router = express.Router();
const bankController = require("./bank.controller");

router.get("/", bankController.getBankAccounts);
router.post("/", bankController.createBankAccount);
router.patch("/:id", bankController.updateBankAccount);

module.exports = router;
