"use strict";

const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const prisma = require("../db");
const logger = require("../logger");

let fcmInitialized = false;

try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
        let serviceAccount;
        try {
            serviceAccount = JSON.parse(serviceAccountJson);
        } catch (parseErr) {
            // Check if it might be a file path instead of raw JSON content
            const fs = require("fs");
            if (fs.existsSync(serviceAccountJson)) {
                serviceAccount = JSON.parse(fs.readFileSync(serviceAccountJson, "utf8"));
            } else {
                throw parseErr;
            }
        }

        initializeApp({
            credential: cert(serviceAccount),
        });
        fcmInitialized = true;
        logger.info("Firebase Admin SDK successfully initialized for Push Notifications.");
    } else {
        logger.warn("FIREBASE_SERVICE_ACCOUNT_JSON env var is missing. Push notifications will run in MOCK mode.");
    }
} catch (err) {
    logger.error("Failed to initialize Firebase Admin SDK. Push notifications will run in MOCK mode.", err);
}

/**
 * Send a push notification to all registered devices of a user.
 * Wraps operations in try-catch so a failure never interrupts the main API request.
 *
 * @param {string} userId - ID of the user to notify
 * @param {object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {object} [payload.data] - Custom data payload (all keys/values must be strings)
 */
async function sendPushNotification(userId, { title, body, data = {} }) {
    try {
        if (!userId) {
            logger.warn("sendPushNotification: userId is undefined or null");
            return;
        }

        // Standardize all data values to string as required by FCM
        const stringifiedData = {};
        for (const [key, val] of Object.entries(data)) {
            if (val !== undefined && val !== null) {
                stringifiedData[key] = String(val);
            }
        }

        // Fetch user's registered device tokens
        const tokens = await prisma.fcmToken.findMany({
            where: { user_id: userId }
        });

        if (!tokens.length) {
            logger.debug(`No FCM tokens registered for user: ${userId}`);
            return;
        }

        const tokenStrings = tokens.map((t) => t.token);

        if (!fcmInitialized) {
            logger.info(`[FCM Push Notification MOCK] User ID: ${userId}
  Title: "${title}"
  Body: "${body}"
  Tokens: [${tokenStrings.join(", ")}]
  Data: ${JSON.stringify(stringifiedData, null, 2)}`);
            return;
        }

        logger.info(`Sending FCM push notification to user ${userId} on ${tokenStrings.length} device(s)`);

        const messaging = getMessaging();
        const response = await messaging.sendEachForMulticast({
            notification: { title, body },
            data: stringifiedData,
            tokens: tokenStrings,
            android: {
                priority: "high",
                notification: { sound: "default" },
            },
            apns: {
                payload: {
                    aps: { sound: "default", badge: 1 },
                },
            },
        });

        logger.info(`FCM multicast send summary: success=${response.successCount}, failure=${response.failureCount}`);

        // Identify and remove invalid/expired tokens from the database
        const tokensToPrune = [];
        response.responses.forEach((resp, i) => {
            if (!resp.success) {
                const errorCode = resp.error?.code;
                if (
                    errorCode === "messaging/invalid-registration-token" ||
                    errorCode === "messaging/registration-token-not-registered"
                ) {
                    tokensToPrune.push(tokenStrings[i]);
                } else {
                    logger.warn(`FCM delivery failure for token: ${tokenStrings[i].substring(0, 15)}... Error: ${resp.error?.message}`);
                }
            }
        });

        if (tokensToPrune.length > 0) {
            logger.info(`Pruning ${tokensToPrune.length} invalid/expired FCM tokens from database`);
            await prisma.fcmToken.deleteMany({
                where: { token: { in: tokensToPrune } }
            });
        }
    } catch (err) {
        // FCM notification failure must NOT break the main API execution
        logger.error("FCM notification error in sendPushNotification:", err);
    }
}

module.exports = {
    sendPushNotification,
    isFcmInitialized: () => fcmInitialized
};
