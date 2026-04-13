const { Client } = require('pg');
require('dotenv').config();

async function checkColumns() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'auth' 
            AND table_name = 'approval_requests'
        `);
        console.log('Columns for auth.approval_requests:');
        console.log(JSON.stringify(res.rows.map(r => r.column_name), null, 2));
    } catch (err) {
        console.error('Database error:', err.message);
    } finally {
        await client.end();
    }
}

checkColumns();
