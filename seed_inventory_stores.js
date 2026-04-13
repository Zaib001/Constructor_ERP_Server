/**
 * seed_inventory_stores.js
 * Seeds default Store records required before GRNs and Material Issues can be created.
 * Run ONCE after the Week 5 schema migration.
 */
require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("🏪 Seeding Inventory Stores...");

    // Fetch all active companies
    const companies = await prisma.company.findMany({
        where: { is_active: true },
        select: { id: true, name: true }
    });

    if (!companies.length) {
        console.error("❌ No companies found. Run RBAC seed first.");
        return;
    }

    for (const company of companies) {
        const existing = await prisma.store.findFirst({
            where: { company_id: company.id, name: "Main Warehouse" }
        });

        if (existing) {
            console.log(`  ⏭️  Main Warehouse already exists for ${company.name}`);
            continue;
        }

        const store = await prisma.store.create({
            data: {
                company_id: company.id,
                name: "Main Warehouse",
                location: "Site Office — Ground Floor",
                is_active: true
            }
        });
        console.log(`  ✅ Created Store: ${store.name} [${store.id}] for ${company.name}`);
    }

    console.log("\n✅ Store seeding complete.");
    console.log("📋 Use these store IDs in GRN and Material Issue payloads.");

    // Print all stores for reference
    const allStores = await prisma.store.findMany({
        select: { id: true, name: true, location: true, company: { select: { name: true } } }
    });
    console.table(allStores.map(s => ({
        store_id: s.id,
        name: s.name,
        company: s.company.name,
        location: s.location
    })));
}

main()
    .catch(e => console.error("❌ Seed failed:", e.message))
    .finally(() => prisma.$disconnect());
