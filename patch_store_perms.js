"use strict";

require("dotenv").config();
const { Pool } = require("pg");

async function run() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("🛠️  Applying Store Management Permissions...");

        // 1. Create Permission
        const pRes = await pool.query(`
            INSERT INTO auth.permissions (code, description, module) 
            VALUES ('inventory.store.manage', 'Manage Stores & Warehouses', 'inventory') 
            ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, module = EXCLUDED.module 
            RETURNING id
        `);
        const permId = pRes.rows[0].id;

        // 2. Assign to Roles
        const rRes = await pool.query(`
            SELECT id FROM auth.roles WHERE code IN ('erp_admin', 'procurement_manager')
        `);

        for (const role of rRes.rows) {
            await pool.query(`
                INSERT INTO auth.role_permissions (role_id, permission_id) 
                VALUES ($1, $2) ON CONFLICT DO NOTHING
            `, [role.id, permId]);
        }

        console.log("✅ Permission 'inventory.store.manage' granted to Admin & Procurement Manager.");
    } catch (err) {
        console.error("❌ Patch failed:", err);
    } finally {
        await pool.end();
    }
}

run();
