const { Client } = require('pg');
require('dotenv').config();

async function seed() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        // 1. Get Company
        const compRes = await client.query("SELECT id FROM auth.companies WHERE is_active = true LIMIT 1");
        const companyId = compRes.rows[0]?.id;
        if (!companyId) throw new Error("No active company found");

        // 2. Get Role (Fallback to any role if Staff not found)
        const roleRes = await client.query("SELECT id FROM auth.roles WHERE name ILIKE '%Staff%' OR name ILIKE '%Engineer%' LIMIT 1");
        const roleId = roleRes.rows[0]?.id;
        if (!roleId) throw new Error("No suitable role found");

        console.log(`Company: ${companyId}, Role: ${roleId}`);

        const projects = ['HOOPOE', 'SKYLINE'];

        for (const name of projects) {
            // Find/Create Project
            let projId;
            const pRes = await client.query("SELECT id FROM auth.projects WHERE name ILIKE $1", [`%${name}%`]);
            if (pRes.rows.length > 0) {
                projId = pRes.rows[0].id;
            } else {
                const insP = await client.query(
                    "INSERT INTO auth.projects (name, code, company_id, status) VALUES ($1, $2, $3, 'active') RETURNING id",
                    [`${name}_CONSTRUCTION`, `${name}_001`, companyId]
                );
                projId = insP.rows[0].id;
            }

            // Find/Create PM User
            let userId;
            const pmName = `PM_${name}`;
            const uRes = await client.query("SELECT id FROM auth.users WHERE name = $1 OR email = $2", [pmName, `${name.toLowerCase()}@hoopoe.com`]);
            if (uRes.rows.length > 0) {
                userId = uRes.rows[0].id;
            } else {
                const insU = await client.query(
                    "INSERT INTO auth.users (name, email, password_hash, company_id, role_id, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING id",
                    [pmName, `${name.toLowerCase()}@hoopoe.com`, 'no_pass_needed_for_seed', companyId, roleId]
                );
                userId = insU.rows[0].id;
            }

            // Assign as PM
            const check = await client.query("SELECT id FROM auth.user_projects WHERE user_id = $1 AND project_id = $2", [userId, projId]);
            if (check.rows.length === 0) {
                await client.query(
                    "INSERT INTO auth.user_projects (user_id, project_id, access_type, assigned_at) VALUES ($1, $2, 'project_manager', NOW())",
                    [userId, projId]
                );
                console.log(`Seeded PM for ${name} successfully.`);
            } else {
                console.log(`PM already assigned for ${name}.`);
            }
        }

    } catch (err) {
        console.error('Seed Error:', err.message);
    } finally {
        await client.end();
    }
}

seed();
