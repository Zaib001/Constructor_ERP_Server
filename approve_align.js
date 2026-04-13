require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log("--- CLEANING MATRICES ---");
        await client.query('DELETE FROM auth.approval_matrices');

        const sAdmin = '413852b7-f0bc-4b80-a7a7-4b011335e454';
        const pmRole = '7677ced0-b62d-4ecd-b98f-3f70ec386508';

        console.log("--- INSERTING NEW ALIGNMENT ---");
        const queries = [
            // PR (Purchase Request)
            ['PR', 0, 10000, pmRole, 1],
            ['PR', 10001, null, pmRole, 1],
            ['PR', 10001, null, sAdmin, 2],
            // PO (Purchase Order)
            ['PO', 0, 50000, pmRole, 1],
            ['PO', 50001, null, pmRole, 1],
            ['PO', 50001, null, sAdmin, 2],
            // QUOTATION
            ['QUOTATION', 0, null, pmRole, 1],
            ['QUOTATION', 0, null, sAdmin, 2],
            // PAYROLL (Salary)
            ['PAYROLL', 0, null, pmRole, 1],
            ['PAYROLL', 0, null, sAdmin, 2],
            // EXPENSE
            ['EXPENSE', 0, null, pmRole, 1],
            ['EXPENSE', 0, null, sAdmin, 2]
        ];

        for (const [type, min, max, role, step] of queries) {
            await client.query(
                'INSERT INTO auth.approval_matrices (doc_type, min_amount, max_amount, role_id, step_order, is_mandatory) VALUES ($1, $2, $3, $4, $5, true)',
                [type, min, max, role, step]
            );
        }

        console.log("✅ Approval Alignment Complete!");

    } catch (err) {
        console.error("Alignment Error:", err);
    } finally {
        await client.end();
    }
}

main();
