"use strict";

module.exports = {
    /** Lock account after this many consecutive failed logins */
    MAX_LOGIN_ATTEMPTS: 5,

    /** Password reset token lifetime in minutes */
    RESET_TOKEN_EXPIRY_MINUTES: 15,

    /** bcrypt work factor — OWASP recommends ≥ 10 */
    BCRYPT_ROUNDS: 12,

    /** JWT access-token lifetime (passed to jsonwebtoken's `expiresIn`) */
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1h",
};
