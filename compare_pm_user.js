const { Client } = require('pg');
require('dotenv').config();

async function compareUsers() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        // Find a working user (one that isn't the new PMs)
        const workingRes = await client.query(`
            SELECT u.*, r.name as role_name 
            FROM auth.users u 
            LEFT JOIN auth.roles r ON u.role_id = r.id 
            WHERE u.is_active = true AND u.email NOT IN ('hoopoe@hoopoe.com', 'skyline@hoopoe.com') 
            LIMIT 1
        `);
        
        // Find one of the new PM users
        const pmRes = await client.query(`
            SELECT u.*, r.name as role_name 
            FROM auth.users u 
            LEFT JOIN auth.roles r ON u.role_id = r.id 
            WHERE u.email = 'hoopoe@hoopoe.com'
        `);

        console.log('Working User Sample:');
        console.log(JSON.stringify(workingRes.rows[0], null, 2));
        
        console.log('\nPM User (Hoopoe):');
        console.log(JSON.stringify(pmRes.rows[0], null, 2));

        // Also check UserProject assignments for the PM
        const upRes = await client.query(`
            SELECT * FROM auth.user_projects WHERE user_id = $1
        `, [pmRes.rows[0]?.id]);
        console.log('\nPM User Project Assignments:');
        console.log(JSON.stringify(upRes.rows, null, 2));

    } catch (err) {
        console.error('Database error:', err.message);
    } finally {
        await client.end();
    }
}

compareUsers();
