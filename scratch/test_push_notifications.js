"use strict";
require("dotenv").config();

const prisma = require("../src/db");
const usersService = require("../src/modules/users/users.service");
const { sendPushNotification, isFcmInitialized } = require("../src/services/notification.service");

async function runTest() {
    console.log("=== FCM Notification System Verification ===");
    console.log(`Firebase Admin SDK status: ${isFcmInitialized() ? "INITIALIZED" : "MOCK MODE (no service account JSON provided)"}`);

    // Fetch an active user from the database
    const testUser = await prisma.user.findFirst({
        where: { is_active: true }
    });

    if (!testUser) {
        console.error("Error: No active users found in the database. Add users or run seeding first.");
        process.exit(1);
    }

    console.log(`Using active test user: Name="${testUser.name}", Email="${testUser.email}", ID="${testUser.id}"`);

    const mockToken = "fcm_test_token_xyz_123456789";
    const mockPlatform = "android";

    // 1. Test registration
    console.log("\n1. Testing FCM token registration (upsert)...");
    await usersService.upsertFcmToken(testUser.id, mockToken, mockPlatform);
    
    // Assert token exists in DB
    const dbTokenRecord = await prisma.fcmToken.findUnique({
        where: { token: mockToken }
    });

    if (!dbTokenRecord) {
        console.error("FAIL: FCM Token was not found in the database after upsert!");
        process.exit(1);
    }
    console.log(`SUCCESS: FCM Token registered in DB. ID: ${dbTokenRecord.id}, Platform: ${dbTokenRecord.platform}`);

    // 2. Test sendPushNotification (runs in mock or live depending on credentials)
    console.log("\n2. Testing sendPushNotification utility...");
    await sendPushNotification(testUser.id, {
        title: "Test Purchase Request",
        body: `PR-2026-001 submitted by ${testUser.name}`,
        data: { type: "PR_SUBMITTED", refId: "dummy-pr-uuid-111" }
    });
    console.log("SUCCESS: Notification dispatch executed successfully.");

    // 3. Test token removal
    console.log("\n3. Testing FCM token removal (delete)...");
    await usersService.deleteFcmToken(testUser.id, mockToken);

    // Assert token no longer exists in DB
    const deletedTokenRecord = await prisma.fcmToken.findUnique({
        where: { token: mockToken }
    });

    if (deletedTokenRecord) {
        console.error("FAIL: FCM Token still exists in the database after delete!");
        process.exit(1);
    }
    console.log("SUCCESS: FCM Token removed from DB.");

    console.log("\n=== Verification Completed Successfully ===");
}

runTest()
    .catch((err) => {
        console.error("Test encountered an error:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
