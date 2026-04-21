require("dotenv").config();
const prisma = require("../src/db");

async function purgeEmployees() {
    try {
        console.log("--- PERMANENTLY PURGING ALL EMPLOYEES ---");
        
        // Count before
        const count = await prisma.employee.count();
        console.log(`Found ${count} employees in database.`);

        if (count === 0) {
            console.log("Database is already empty.");
            return;
        }

        // We use a transaction to try and delete all
        // If there are foreign key constraints, this might fail for some
        // So we'll try to delete them one by one to catch which ones have relations
        const employees = await prisma.employee.findMany({ select: { id: true, name: true } });
        
        let deletedCount = 0;
        let failedCount = 0;

        for (const emp of employees) {
            try {
                await prisma.employee.delete({ where: { id: emp.id } });
                console.log(`Deleted: ${emp.name} (${emp.id})`);
                deletedCount++;
            } catch (err) {
                console.warn(`Could not hard-delete ${emp.name} due to existing history (Timesheets/Logs).`);
                
                // For those that cannot be hard-deleted, we'll do the 'Suffix Rename' 
                // to at least free up the Iqama/Code/Passport for the user.
                const suffix = `_PURGED_${Date.now()}`;
                await prisma.employee.update({
                    where: { id: emp.id },
                    data: { 
                        is_active: false,
                        iqama_no: null, // Setting to null is better for purging
                        employee_code: null,
                        passport_no: null,
                        updated_at: new Date()
                    }
                });
                console.log(`  -> Record archived and unique IDs cleared instead.`);
                failedCount++;
            }
        }

        console.log(`\n--- Purge Complete ---`);
        console.log(`Successfully hard-deleted: ${deletedCount}`);
        console.log(`Archived with IDs cleared: ${failedCount}`);

    } catch (error) {
        console.error("Critical error during purge:", error);
    } finally {
        await prisma.$disconnect();
    }
}

purgeEmployees();
