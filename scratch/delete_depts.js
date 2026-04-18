const prisma = require('../src/db');
async function run() { 
    try { 
        console.log("Unlinking foreign key relations...");
        
        await prisma.user.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.employee.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.vehicle.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.equipment.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.vendor.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.purchaseOrder.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.approvalMatrix.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.submittal.updateMany({ data: { department_id: null } }).catch(() => {});
        await prisma.rFI.updateMany({ data: { department_id: null } }).catch(() => {});
        // Add more catch-alls just in case
        await prisma.$executeRawUnsafe(`
            DO $$ DECLARE
                r RECORD;
            BEGIN
                FOR r IN (SELECT table_name FROM information_schema.columns WHERE column_name = 'department_id' AND table_schema = 'auth') LOOP
                    EXECUTE 'UPDATE auth.' || quote_ident(r.table_name) || ' SET department_id = NULL;';
                END LOOP;
            END $$;
        `);

        console.log("All relations unlinked. Deleting organizational units (departments)...");
        const result = await prisma.department.deleteMany(); 
        console.log(`Successfully deleted ${result.count} Organizational Units.`); 
    } catch(e) { 
        console.error('Deletion failed:', e); 
    } 
} 
run().catch(console.dir);
