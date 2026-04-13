const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const sql = fs.readFileSync('fix_schema.sql', 'utf8');
        await client.query(sql);
        console.log('SUCCESS: Global schema update complete');
    } catch (err) {
        console.error('FAILED during update:', err.message);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

run();
