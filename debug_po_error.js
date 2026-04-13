const prisma = require('./src/db');
const { createPO } = require('./src/modules/purchaseOrders/purchaseOrders.service');

async function debugPO() {
    try {
        console.log("Starting PO creation debug...");
        
        // Find a valid user to act as creator
        const user = await prisma.user.findFirst({
            where: { roles: { code: { in: ["erp_admin", "super_admin"] } } },
            include: { roles: true }
        });

        if (!user) {
            console.error("No valid ERP Admin user found for testing.");
            process.exit(1);
        }

        console.log(`Using user: ${user.name} (${user.roles.code})`);

        // Mock PO data
        const poData = {
            vendor_id: (await prisma.vendor.findFirst())?.id,
            project_id: (await prisma.project.findFirst())?.id,
            po_number: `DEBUG-PO-${Date.now()}`,
            items: [
                {
                    item_id: (await prisma.item.findFirst())?.id,
                    itemName: "Debug Item - Material",
                    quantity: 10,
                    unit_price: 50,
                    isService: false
                },
                {
                    itemName: "Debug Service - Crane",
                    quantity: 1,
                    unit_price: 500,
                    isService: true
                }
            ]
        };

        const result = await createPO(poData, {
            id: user.id,
            companyId: user.company_id,
            roleCode: user.roles.code,
            department_id: user.department_id
        });

        console.log("SUCCESS! PO created:", result.po_number);
    } catch (err) {
        console.error("FAILED with error:");
        console.error(err);
        if (err.meta) console.error("Prisma Meta:", err.meta);
    } finally {
        await prisma.$disconnect();
    }
}

debugPO();
