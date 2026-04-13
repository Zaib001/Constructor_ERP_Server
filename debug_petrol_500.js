require('dotenv').config();
const prisma = require('./src/db');
const { applyDataScope } = require('./src/utils/scoping');

async function debug() {
    // Mock user Sara Engineer
    const user = {
        id: 'fef7f2f1-61b6-4b2a-89a1-baef9bd76766', // SARAH ID from seed script? No, I need real ID
        userId: 'fef7f2f1-61b6-4b2a-89a1-baef9bd76766',
        roleCode: 'site_engineer',
        companyId: null, // will be fetched
        isSuperAdmin: false
    };

    try {
        const sarah = await prisma.user.findFirst({
            where: { email: 'engineer@erp.com' }
        });
        if (!sarah) throw new Error("Sarah not found");
        
        user.id = sarah.id;
        user.companyId = sarah.company_id;

        console.log("Checking SARAH scoping for Petrol Expenses...");
        
        // REPRODUCING SERVICE LOGIC
        const whereSnippet = applyDataScope(user);
        const where = { ...whereSnippet };
        
        where.OR = [
            { job_type: "admin" },
            {
                job_type: "job",
                project: {
                    user_projects: {
                        some: {
                            user_id: sarah.id,
                            revoked_at: null
                        }
                    }
                }
            }
        ];

        console.log("Constructed WHERE:", JSON.stringify(where, null, 2));

        const result = await prisma.petrolExpense.findMany({
            where,
            take: 10,
            include: {
                vehicle: { select: { plate_no: true } }, 
                project: { select: { name: true, code: true } },
                creator: { select: { name: true } }
            }
        });

        console.log("Query Successful! Count:", result.length);

        console.log("\nChecking SARAH Reports...");
        const reportWhere = applyDataScope(user);
        reportWhere.verification_status = "verified";
        
        reportWhere.OR = [
            { job_type: "admin" },
            {
                job_type: "job",
                project: {
                    user_projects: {
                        some: {
                            user_id: sarah.id,
                            revoked_at: null
                        }
                    }
                }
            }
        ];

        const expenses = await prisma.petrolExpense.findMany({ 
            where: reportWhere,
            include: { project: true, vehicle: true }
        });

        console.log("Reports Query Successful! Count:", expenses.length);

    } catch (err) {
        console.error("FATAL ERROR IN QUERY:", err);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
