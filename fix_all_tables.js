const { Client } = require('pg');
require('dotenv').config();

async function fixAllTables() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const tables = [
            'auth.companies',
            'auth.roles',
            'auth.departments',
            'auth.users',
            'auth.projects',
            'auth.approval_requests',
            'auth.approval_steps',
            'auth.vendors',
            'auth.purchase_orders',
            'auth.payrolls',
            'auth.quotations',
            'auth.expenses',
            'auth.wbs',
            'auth.cost_codes',
            'auth.items',
            'auth.employees',
            'auth.vehicles',
            'auth.equipment',
            'auth.company_documents',
            'auth.facility_documents',
            'auth.stocks',
            'auth.purchase_requests',
            'auth.excess_materials'
        ];

        for (const table of tables) {
            const [schema, tableName] = table.split('.');
            process.stdout.write(`Syncing ${table}... `);
            try {
                await client.query(`
                    DO $$ 
                    BEGIN 
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                       WHERE table_schema = '${schema}' 
                                       AND table_name = '${tableName}' 
                                       AND column_name = 'deleted_at') THEN
                            EXECUTE 'ALTER TABLE ${table} ADD COLUMN deleted_at TIMESTAMP(6)';
                        END IF;
                    END $$;
                `);
                console.log('OK');
            } catch (tableErr) {
                console.log(`FAILED: ${tableErr.message}`);
            }
        }

        console.log('\nFinal sanity check: regenerating prisma client...');
    } catch (err) {
        console.error('CRITICAL ERROR:', err.message);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

fixAllTables();
