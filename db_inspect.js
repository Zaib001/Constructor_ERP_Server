require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log("--- ROLES ---");
        const roles = await client.query('SELECT id, name, code FROM auth.roles');
        console.log(JSON.stringify(roles.rows, null, 2));

        console.log("\n--- COMPANIES ---");
        const companies = await client.query('SELECT id, name, code FROM auth.companies');
        console.log(JSON.stringify(companies.rows, null, 2));

        console.log("\n--- USERS (Sample) ---");
        const users = await client.query(`
            SELECT u.email, r.code as role_code, c.name as company_name 
            FROM auth.users u
            LEFT JOIN auth.roles r ON u.role_id = r.id
            LEFT JOIN auth.companies c ON u.company_id = c.id
            LIMIT 10
        `);
        console.log(JSON.stringify(users.rows, null, 2));

        console.log("\n--- SCHEMA CHECK (Isolation) ---");
        const tableCols = await client.query(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'auth' 
            AND column_name = 'company_id'
            AND table_name IN ('employees', 'vehicles', 'equipment', 'projects', 'vendors', 'users')
        `);
        console.log("Tables with company_id:", tableCols.rows.map(r => r.table_name));

    } catch (err) {
        console.error("Database Inspection Error:", err);
    } finally {
        await client.end();
    }
}

main();
