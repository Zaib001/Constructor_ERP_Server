const { Client } = require('pg');
require('dotenv').config();

async function findIds() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        const company = await client.query("SELECT id, name FROM auth.companies LIMIT 1");
        const roles = await client.query("SELECT id, name FROM auth.roles");

        console.log('Company:', JSON.stringify(company.rows, null, 2));
        console.log('Roles:', JSON.stringify(roles.rows, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }
}

findIds();
