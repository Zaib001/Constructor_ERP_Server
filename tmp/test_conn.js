const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function test() {
  console.log("Testing connection to:", process.env.DATABASE_URL.split('@')[1]);
  try {
    const res = await pool.query('SELECT NOW()');
    console.log("Connection successful! DB Time:", res.rows[0].now);
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await pool.end();
  }
}

test();
