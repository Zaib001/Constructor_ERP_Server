"use strict";

require("dotenv").config();
const { Pool } = require("pg");

async function run() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("🔍 Investigating WBS and Cost Codes...");
        
        // 1. Get the project from Antigravity Construction
        const projectRes = await pool.query(`
            SELECT p.id, p.name 
            FROM auth.projects p 
            JOIN auth.companies c ON p.company_id = c.id 
            WHERE c.code = 'ANT-CONS' 
            LIMIT 1
        `);
        
        if (projectRes.rows.length === 0) {
            console.log("❌ No projects found for ANT-CONS.");
            return;
        }
        
        const project = projectRes.rows[0];
        console.log(`Found Project: ${project.name} (${project.id})`);

        // 2. Get WBS nodes
        const wbsRes = await pool.query(`
            SELECT id, name FROM auth.wbs WHERE project_id = $1 AND deleted_at IS NULL
        `, [project.id]);
        
        console.log(`Found ${wbsRes.rows.length} WBS nodes.`);

        // 3. Get Cost Codes
        const ccRes = await pool.query(`
            SELECT cc.id, cc.category, w.name as wbs_name 
            FROM auth.cost_codes cc 
            JOIN auth.wbs w ON cc.wbs_id = w.id 
            WHERE w.project_id = $1 AND cc.deleted_at IS NULL
        `, [project.id]);

        console.log("Existing Cost Codes:", ccRes.rows);
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await pool.end();
    }
}

run();
