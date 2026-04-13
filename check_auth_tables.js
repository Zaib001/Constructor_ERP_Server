const { Client } = require('pg');
require('dotenv').config();

async function checkTables() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'auth'
        `);
        console.log('Tables in auth schema:');
        console.log(JSON.stringify(res.rows.map(r => r.table_name), null, 2));
    } catch (err) {
        console.error('Database error:', err.message);
    } finally {
        await client.end();
    }
}

checkTables();
