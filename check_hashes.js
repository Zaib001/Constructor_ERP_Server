const { Client } = require('pg');
require('dotenv').config();

async function getHash() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query("SELECT email, password_hash FROM auth.users WHERE is_active = true LIMIT 5");
        console.log('Active Users and Hashes:');
        console.log(JSON.stringify(res.rows, null, 2));

        // Let's also find the PM users to see their current state
        const pmUsers = await client.query("SELECT id, name, email FROM auth.users WHERE email IN ('hoopoe@hoopoe.com', 'skyline@hoopoe.com')");
        console.log('PM Users:', JSON.stringify(pmUsers.rows, null, 2));

    } catch (err) {
        console.error('Database error:', err.message);
    } finally {
        await client.end();
    }
}

getHash();
