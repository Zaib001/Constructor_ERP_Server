const { Client } = require('pg');
require('dotenv').config();

async function fixAllMissingColumns() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const tables = [
            'auth.users',
            'auth.projects',
            'auth.departments',
            'auth.companies',
            'auth.vendors',
            'auth.quotations',
            'auth.expenses',
            'auth.payrolls',
            'auth.purchase_orders'
        ];

        for (const table of tables) {
            console.log(`Checking/Fixing table ${table}...`);
            const [schema, tableName] = table.split('.');
            await client.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                   WHERE table_schema = '${schema}' 
                                   AND table_name = '${tableName}' 
                                   AND column_name = 'deleted_at') THEN
                        EXECUTE 'ALTER TABLE ${table} ADD COLUMN deleted_at TIMESTAMP(6)';
                        RAISE NOTICE 'Added deleted_at to %', '${table}';
                    END IF;
                END $$;
            `);
        }

        console.log('Global schema update complete');
    } catch (err) {
        console.error('Error during global schema update:', err.message);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

fixAllMissingColumns();
