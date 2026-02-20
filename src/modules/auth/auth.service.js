"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../../db");
const logger = require("../../logger");
const { logAudit } = require("../../utils/auditLogger");
const { MAX_LOGIN_ATTEMPTS, RESET_TOKEN_EXPIRY_MINUTES, BCRYPT_ROUNDS } = require("./auth.constants");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateJWT(user) {
    return jwt.sign(
        {
            userId: user.id,
            roleId: user.role_id,
            email: user.email,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
    );
}

function createAppError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * Register a new user (admin-only action).
 */
async function registerUser(data, actorId, ipAddress, deviceInfo) {
    const { employeeCode, name, email, phone, password, roleId, department, designation } = data;

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        throw createAppError("Email address is already registered", 400);
    }

    // Validate roleId if provided
    if (roleId) {
        const role = await prisma.role.findFirst({ where: { id: roleId, is_active: true } });
        if (!role) {
            throw createAppError("Specified role does not exist or is inactive", 400);
        }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const newUser = await prisma.user.create({
        data: {
            employee_code: employeeCode || null,
            name,
            email,
            phone: phone || null,
            password_hash: passwordHash,
            role_id: roleId || null,
            department: department || null,
            designation: designation || null,
            is_active: true,
            is_locked: false,
            login_attempts: 0,
            created_by: actorId,
        },
        select: { id: true, name: true, email: true, role_id: true },
    });

    await logAudit({
        userId: actorId,
        module: "auth",
        entity: "user",
        entityId: newUser.id,
        action: "REGISTER",
        beforeData: null,
        afterData: { email: newUser.email, name: newUser.name },
        ipAddress,
        deviceInfo,
    });

    logger.info(`User registered: ${email} by ${actorId}`);
    return newUser;
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Authenticate a user and create a session.
 */
async function loginUser(email, password, ipAddress, deviceInfo) {
    // Find user with role info
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            roles: {
                include: {
                    role_permissions: {
                        include: {
                            permissions: true
                        }
                    }
                }
            }
        },
    });

    if (!user || user.deleted_at !== null) {
        throw createAppError("Invalid credentials", 401);
    }

    if (!user.is_active) {
        throw createAppError("Account is inactive. Contact your administrator.", 403);
    }

    if (user.is_locked) {
        throw createAppError(
            "Account is locked due to too many failed login attempts. Contact your administrator.",
            423
        );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
        const newAttempts = (user.login_attempts || 0) + 1;
        const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

        await prisma.user.update({
            where: { id: user.id },
            data: {
                login_attempts: newAttempts,
                is_locked: shouldLock,
                updated_at: new Date(),
            },
        });

        await logAudit({
            userId: user.id,
            module: "auth",
            entity: "user",
            entityId: user.id,
            action: shouldLock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
            beforeData: { login_attempts: user.login_attempts },
            afterData: { login_attempts: newAttempts, is_locked: shouldLock },
            ipAddress,
            deviceInfo,
        });

        if (shouldLock) {
            throw createAppError(
                "Account has been locked after too many failed attempts. Contact your administrator.",
                423
            );
        }

        throw createAppError("Invalid credentials", 401);
    }

    // Anomaly Detection: Check if this IP/Device has been used before by this user
    const previousSession = await prisma.userSession.findFirst({
        where: { user_id: user.id },
        orderBy: { login_time: "desc" },
    });

    const isNewIp = previousSession && previousSession.ip_address !== ipAddress;
    const isNewDevice = previousSession && previousSession.device_info !== deviceInfo;

    if (isNewIp || isNewDevice) {
        await logAudit({
            userId: user.id,
            module: "auth",
            entity: "user_session",
            entityId: user.id,
            action: "SECURITY_ALERT_NEW_LOGIN",
            beforeData: { last_ip: previousSession?.ip_address, last_device: previousSession?.device_info },
            afterData: { current_ip: ipAddress, current_device: deviceInfo },
            ipAddress,
            deviceInfo,
        });
        logger.warn(`Suspicious login detected for ${email}: New IP/Device`, { ipAddress, deviceInfo });
    }

    // Successful login — reset attempts, update lastLoginAt
    await prisma.user.update({
        where: { id: user.id },
        data: {
            login_attempts: 0, // Explicitly reset attempts
            last_login_at: new Date(),
            updated_at: new Date(),
        },
    });

    // Generate JWT
    const token = generateJWT(user);

    // Create session record
    const session = await prisma.userSession.create({
        data: {
            user_id: user.id,
            jwt_token: token,
            ip_address: ipAddress,
            device_info: deviceInfo,
            login_time: new Date(),
            is_active: true,
        },
    });

    await logAudit({
        userId: user.id,
        module: "auth",
        entity: "user_session",
        entityId: session.id, // Use session ID for better tracking
        action: "LOGIN",
        beforeData: null,
        afterData: { email: user.email, session_id: session.id, login_at: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`User logged in: ${email} (session: ${session.id})`);

    const permissions = user.roles?.role_permissions?.map(rp => rp.permissions?.code).filter(Boolean) || [];

    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.roles ? user.roles.name : null,
            roleCode: user.roles ? user.roles.code : null,
            permissions,
        },
    };
}

/**
 * Get the current authenticated user's profile and permissions.
 */
async function getMe(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            roles: {
                include: {
                    role_permissions: {
                        include: {
                            permissions: true
                        }
                    }
                }
            }
        },
    });

    if (!user || user.deleted_at !== null) {
        throw createAppError("User not found", 404);
    }

    const permissions = user.roles?.role_permissions?.map(rp => rp.permissions?.code).filter(Boolean) || [];

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.roles ? user.roles.name : null,
        roleCode: user.roles ? user.roles.code : null,
        permissions,
    };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * Deactivate the current session.
 */
async function logoutUser(token, userId, ipAddress, deviceInfo) {
    const session = await prisma.userSession.findFirst({
        where: { jwt_token: token, user_id: userId, is_active: true },
    });

    if (!session) {
        throw createAppError("No active session found", 400);
    }

    await prisma.userSession.update({
        where: { id: session.id },
        data: {
            logout_time: new Date(),
            is_active: false,
        },
    });

    await logAudit({
        userId,
        module: "auth",
        entity: "user_session",
        entityId: session.id,
        action: "LOGOUT",
        beforeData: { is_active: true },
        afterData: { is_active: false, logout_time: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`User logged out: userId=${userId}`);
}

// ─── Change Password ──────────────────────────────────────────────────────────

/**
 * Validate the old password and set a new one.
 */
async function changePassword(userId, oldPassword, newPassword, ipAddress, deviceInfo) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.deleted_at !== null) {
        throw createAppError("User not found", 404);
    }

    const passwordMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!passwordMatch) {
        throw createAppError("Current password is incorrect", 401);
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
        where: { id: userId },
        data: {
            password_hash: newHash,
            last_password_change: new Date(),
            updated_at: new Date(),
        },
    });

    await logAudit({
        userId,
        module: "auth",
        entity: "user",
        entityId: userId,
        action: "CHANGE_PASSWORD",
        beforeData: null,
        afterData: { last_password_change: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Password changed: userId=${userId}`);
}

// ─── Request Password Reset ───────────────────────────────────────────────────

/**
 * Generate a time-limited reset token and save it.
 *
 * NOTE: In production, send this token via email (Nodemailer / SendGrid).
 * For dev/testing the token is returned directly from the controller.
 */
async function requestPasswordReset(email) {
    // Silently succeed even if email not found — prevents user enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deleted_at !== null || !user.is_active) {
        return null; // controller will still return 200
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any existing unused tokens for this user
    await prisma.passwordReset.updateMany({
        where: { user_id: user.id, used: false },
        data: { used: true },
    });

    await prisma.passwordReset.create({
        data: {
            user_id: user.id,
            reset_token: resetToken,
            expires_at: expiresAt,
            used: false,
        },
    });

    logger.info(`Password reset requested: userId=${user.id}`);

    // TODO (production): Send resetToken to user.email via email provider
    return { resetToken, userId: user.id };
}

// ─── Reset Password ───────────────────────────────────────────────────────────

/**
 * Validate the reset token and set a new password.
 */
async function resetPassword(token, newPassword, ipAddress, deviceInfo) {
    const resetRecord = await prisma.passwordReset.findFirst({
        where: { reset_token: token },
        include: { users: true },
    });

    if (!resetRecord) {
        throw createAppError("Invalid reset token", 400);
    }

    if (resetRecord.used) {
        throw createAppError("Reset token has already been used", 400);
    }

    if (new Date() > new Date(resetRecord.expires_at)) {
        throw createAppError("Reset token has expired", 400);
    }

    const user = resetRecord.users;
    if (!user || user.deleted_at !== null || !user.is_active) {
        throw createAppError("Associated account is not available", 400);
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
        prisma.user.update({
            where: { id: user.id },
            data: {
                password_hash: newHash,
                last_password_change: new Date(),
                updated_at: new Date(),
            },
        }),
        prisma.passwordReset.update({
            where: { id: resetRecord.id },
            data: { used: true },
        }),
    ]);

    await logAudit({
        userId: user.id,
        module: "auth",
        entity: "user",
        entityId: user.id,
        action: "RESET_PASSWORD",
        beforeData: null,
        afterData: { last_password_change: new Date().toISOString() },
        ipAddress,
        deviceInfo,
    });

    logger.info(`Password reset successful: userId=${user.id}`);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    changePassword,
    requestPasswordReset,
    resetPassword,
    getMe,
};
