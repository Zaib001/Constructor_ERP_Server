const { Client } = require('pg');
require('dotenv').config();

async function fixPasswords() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        // 1. Find a hash from an active user (Source of Truth)
        const sourceRes = await client.query("SELECT password_hash FROM auth.users WHERE is_active = true AND password_hash LIKE '$2a$12$%' OR password_hash LIKE '$2b$12$%' LIMIT 1");
        const workingHash = sourceRes.rows[0]?.password_hash;
        
        if (!workingHash) {
            console.error("Could not find a valid working hash in the DB.");
            return;
        }

        console.log(`Cloning working hash: ${workingHash}`);

        // 2. Update the PM users
        const updateRes = await client.query(
            "UPDATE auth.users SET password_hash = $1 WHERE email IN ('hoopoe@hoopoe.com', 'skyline@hoopoe.com')",
            [workingHash]
        );

        console.log(`Updated ${updateRes.rowCount} PM users.`);

    } catch (err) {
        console.error('Update Error:', err.message);
    } finally {
        await client.end();
    }
}

fixPasswords();

