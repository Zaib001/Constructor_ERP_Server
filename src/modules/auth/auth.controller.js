"use strict";

const authService = require("./auth.service");
const logger = require("../../logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIp(req) {
    return (
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip ||
        null
    );
}

function getDevice(req) {
    return req.headers["user-agent"] || null;
}

// ─── Register ─────────────────────────────────────────────────────────────────

async function register(req, res, next) {
    try {
        const newUser = await authService.registerUser(
            req.body,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );

        return res.status(201).json({
            success: true,
            message: "User created successfully",
            data: { id: newUser.id, name: newUser.name, email: newUser.email },
        });
    } catch (err) {
        next(err);
    }
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        const result = await authService.loginUser(
            email,
            password,
            getIp(req),
            getDevice(req)
        );

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

async function logout(req, res, next) {
    try {
        await authService.logoutUser(
            req.token,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );

        return res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (err) {
        next(err);
    }
}

// ─── Change Password ──────────────────────────────────────────────────────────

async function changePassword(req, res, next) {
    try {
        const { oldPassword, newPassword } = req.body;

        await authService.changePassword(
            req.user.userId,
            oldPassword,
            newPassword,
            getIp(req),
            getDevice(req)
        );

        return res.status(200).json({
            success: true,
            message: "Password changed successfully",
        });
    } catch (err) {
        next(err);
    }
}

// ─── Request Password Reset ───────────────────────────────────────────────────

async function requestPasswordReset(req, res, next) {
    try {
        const result = await authService.requestPasswordReset(req.body.email);

        // Always return 200 to prevent user enumeration
        // In production: send result.resetToken via email and never expose it here
        const response = {
            success: true,
            message: "If the email exists, a reset link has been generated",
        };

        if (result && process.env.NODE_ENV !== "production") {
            // DEV ONLY — expose token for testing via Postman
            response._dev_reset_token = result.resetToken;
        }

        return res.status(200).json(response);
    } catch (err) {
        next(err);
    }
}

// ─── Reset Password ───────────────────────────────────────────────────────────

async function resetPassword(req, res, next) {
    try {
        const { token, newPassword } = req.body;

        await authService.resetPassword(
            token,
            newPassword,
            getIp(req),
            getDevice(req)
        );

        return res.status(200).json({
            success: true,
            message: "Password has been reset successfully",
        });
    } catch (err) {
        next(err);
    }
}

async function getMe(req, res, next) {
    try {
        const result = await authService.getMe(req.user.userId);
        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    register,
    login,
    logout,
    changePassword,
    requestPasswordReset,
    resetPassword,
    getMe,
};
