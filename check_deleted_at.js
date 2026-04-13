const { Client } = require('pg');
require('dotenv').config();

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'auth'
        `);

        for (const r of tablesRes.rows) {
            const tableName = r.table_name;
            const colsRes = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'auth' 
                AND table_name = $1 
                AND column_name = 'deleted_at'
            `, [tableName]);

            if (colsRes.rows.length === 0) {
                console.log(`MISSING in table: ${tableName}`);
            } else {
                console.log(`OK: ${tableName}`);
            }
        }
    } catch (err) {
        console.error('Error during check:', err);
    } finally {
        await client.end();
    }
}

check();
