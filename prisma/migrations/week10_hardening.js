require("dotenv").config();
const prisma = require("../../src/db");async function run() {
    try {
        console.log("Adding payroll_run_id to labor_cost_allocations...");
        await prisma.$executeRawUnsafe(`ALTER TABLE "auth"."labor_cost_allocations" ADD COLUMN IF NOT EXISTS "payroll_run_id" UUID;`);
        
        console.log("Populating payroll_run_id...");
        await prisma.$executeRawUnsafe(`
            UPDATE "auth"."labor_cost_allocations" lca
            SET payroll_run_id = pi.payroll_run_id
            FROM "auth"."payroll_items" pi
            WHERE lca.payroll_item_id = pi.id AND lca.payroll_run_id IS NULL;
        `);

        console.log("Creating compound index...");
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "labor_cost_allocations_project_id_payroll_run_id_idx" ON "auth"."labor_cost_allocations"("project_id", "payroll_run_id");`);

        console.log("Migration complete!");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await prisma.$disconnect();
    }
}
run();
