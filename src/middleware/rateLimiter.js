"use strict";

const rateLimit = require("express-rate-limit");

const complianceLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 15, // Limit each IP to 15 compliance requests per minute
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        success: false,
        message: "Too many compliance requests from this IP. Please try again after a minute."
    }
});

module.exports = { complianceLimiter };
