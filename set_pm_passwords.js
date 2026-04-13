const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setPassword() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('Admin@123', salt);

        const emails = ['hoopoe@hoopoe.com', 'skyline@hoopoe.com'];

        for (const email of emails) {
            const res = await client.query(
                "UPDATE auth.users SET password_hash = $1 WHERE email = $2 RETURNING id",
                [hash, email]
            );
            
            if (res.rows.length > 0) {
                console.log(`Updated password for ${email}`);
            } else {
                console.log(`Failed to find user with email ${email}`);
            }
        }

    } catch (err) {
        console.error('Update error:', err.message);
    } finally {
        await client.end();
    }
}

setPassword();
