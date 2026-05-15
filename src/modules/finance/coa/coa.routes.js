"use strict";

const express = require("express");
const router = express.Router();
const coaController = require("./coa.controller");

router.get("/", coaController.getAccounts);
router.post("/", coaController.createAccount);
router.patch("/:id", coaController.updateAccount);
router.delete("/:id", coaController.deleteAccount);

module.exports = router;
