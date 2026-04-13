const { Client } = require('pg');
require('dotenv').config();

async function updateFinanceSchema() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const tables = [
            'auth.quotations',
            'auth.expenses',
            'auth.payrolls',
            'auth.purchase_orders'
        ];

        for (const table of tables) {
            console.log(`Checking/Updating table ${table}...`);
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
                    ELSE
                        RAISE NOTICE 'Column deleted_at already exists in %', '${table}';
                    END IF;
                END $$;
            `);
        }

        console.log('Finance schema update process finished');
    } catch (err) {
        console.error('Error during finance schema update:', err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

updateFinanceSchema();
