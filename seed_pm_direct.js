const { Client } = require('pg');
require('dotenv').config();

async function seedPM() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        // 1. Get Company
        const compRes = await client.query("SELECT id FROM auth.companies LIMIT 1");
        const companyId = compRes.rows[0]?.id;
        if (!companyId) throw new Error("No company found");

        console.log(`Using Company ID: ${companyId}`);

        const projectNames = ['HOOPOE', 'SKYLINE'];

        for (const name of projectNames) {
            // 2. Find/Create Project
            let projId;
            const projRes = await client.query("SELECT id FROM auth.projects WHERE name ILIKE $1", [`%${name}%`]);
            if (projRes.rows.length > 0) {
                projId = projRes.rows[0].id;
                console.log(`Project ${name} exists: ${projId}`);
            } else {
                const insProj = await client.query(
                    "INSERT INTO auth.projects (name, code, company_id, status) VALUES ($1, $2, $3, 'active') RETURNING id",
                    [`${name}_Construction`, `${name}_001`, companyId]
                );
                projId = insProj.rows[0].id;
                console.log(`Created Project ${name}: ${projId}`);
            }

            // 3. Find/Create PM User
            let userId;
            const userName = `PM_${name}`;
            const userRes = await client.query("SELECT id FROM auth.users WHERE name = $1", [userName]);
            if (userRes.rows.length > 0) {
                userId = userRes.rows[0].id;
                console.log(`User ${userName} exists: ${userId}`);
            } else {
                const insUser = await client.query(
                    "INSERT INTO auth.users (name, email, username, password, company_id, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING id",
                    [userName, `${userName.toLowerCase()}@erp.com`, userName.toLowerCase(), 'password_placeholder', companyId]
                );
                userId = insUser.rows[0].id;
                console.log(`Created User ${userName}: ${userId}`);
            }

            // 4. Assign PM to Project
            const checkAss = await client.query(
                "SELECT id FROM auth.user_projects WHERE user_id = $1 AND project_id = $2",
                [userId, projId]
            );
            if (checkAss.rows.length === 0) {
                await client.query(
                    "INSERT INTO auth.user_projects (user_id, project_id, access_type, assigned_at) VALUES ($1, $2, 'project_manager', NOW())",
                    [userId, projId]
                );
                console.log(`Assigned ${userName} to ${name}`);
            } else {
                console.log(`${userName} already assigned to ${name}`);
            }
        }

    } catch (err) {
        console.error('Seeding error:', err.message);
    } finally {
        await client.end();
    }
}

seedPM();
