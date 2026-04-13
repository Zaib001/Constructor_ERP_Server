const { Client } = require('pg');
require('dotenv').config();

async function checkUserAuthData() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        const emails = ['hoopoe@hoopoe.com', 'admin@erp.com']; // Seeded vs Working Admin

        for (const email of emails) {
            console.log(`\n--- Data for ${email} ---`);
            
            // Replicate the query in auth.service.js:loginUser
            const userRes = await client.query(`
                SELECT 
                    u.id, u.name, u.email, u.is_active, u.is_locked, u.deleted_at,
                    r.id as role_id, r.name as role_name, r.code as role_code,
                    d.id as dept_id, d.name as dept_name, d.code as dept_code, d.head_id as dept_head_id,
                    c.id as comp_id, c.name as comp_name, c.code as comp_code
                FROM auth.users u
                LEFT JOIN auth.roles r ON u.role_id = r.id
                LEFT JOIN auth.departments d ON u.department_id = d.id
                LEFT JOIN auth.companies c ON u.company_id = c.id
                WHERE u.email = $1
            `, [email]);

            if (userRes.rows.length === 0) {
                console.log('User not found');
                continue;
            }

            const user = userRes.rows[0];
            console.log('User Record:', JSON.stringify(user, null, 2));

            // Check permissions
            const permRes = await client.query(`
                SELECT p.code
                FROM auth.role_permissions rp
                JOIN auth.permissions p ON rp.permission_id = p.id
                WHERE rp.role_id = $1
            `, [user.role_id]);
            
            console.log('Permissions:', permRes.rows.map(r => r.code));
            
            // Check Project Assignments
            const projRes = await client.query(`
                SELECT p.name, up.access_type
                FROM auth.user_projects up
                JOIN auth.projects p ON up.project_id = p.id
                WHERE up.user_id = $1
            `, [user.id]);
            console.log('Project Assignments:', projRes.rows);
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }
}

checkUserAuthData();
