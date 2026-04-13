"use strict";

require("dotenv").config();
const { Pool } = require("pg");

async function run() {
    console.log("🛠️ Patching Storekeeper Permissions...");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // 1. Get Role ID
        const roleRes = await pool.query("SELECT id FROM auth.roles WHERE code = 'storekeeper'");
        if (roleRes.rows.length === 0) {
            console.error("❌ Role 'storekeeper' not found.");
            return;
        }
        const roleId = roleRes.rows[0].id;

        // 2. Get Permission ID
        const permRes = await pool.query("SELECT id FROM auth.permissions WHERE code = 'wbs.read'");
        if (permRes.rows.length === 0) {
            console.error("❌ Permission 'wbs.read' not found.");
            return;
        }
        const permId = permRes.rows[0].id;

        // 3. Grant Permission
        await pool.query(
            "INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [roleId, permId]
        );

        console.log("✅ Permission 'wbs.read' granted to 'storekeeper' role.");
    } catch (err) {
        console.error("❌ Patch failed:", err);
    } finally {
        await pool.end();
    }
}

run();
