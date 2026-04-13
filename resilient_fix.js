const { Client } = require('pg');
require('dotenv').config();

const tables = [
    'auth.companies', 'auth.roles', 'auth.departments', 'auth.users', 'auth.projects',
    'auth.approval_requests', 'auth.approval_steps', 'auth.vendors', 'auth.purchase_orders',
    'auth.payrolls', 'auth.quotations', 'auth.expenses', 'auth.wbs', 'auth.cost_codes',
    'auth.items', 'auth.employees', 'auth.vehicles', 'auth.equipment', 'auth.company_documents',
    'auth.facility_documents', 'auth.stocks', 'auth.purchase_requests', 'auth.excess_materials'
];

async function fixTable(table) {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
        const [schema, tableName] = table.split('.');
        await client.query(`
            DO $$ BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_schema = '${schema}' AND table_name = '${tableName}' AND column_name = 'deleted_at') THEN
                    EXECUTE 'ALTER TABLE ${table} ADD COLUMN deleted_at TIMESTAMP(6)';
                END IF;
            END $$;
        `);
        console.log(`OK: ${table}`);
    } catch (err) {
        console.error(`ERROR ${table}: ${err.message}`);
    } finally {
        await client.end();
    }
}

async function run() {
    for (const table of tables) {
        await fixTable(table);
        // Small delay to prevent connection saturation
        await new Promise(r => setTimeout(r, 200));
    }
}

run();
