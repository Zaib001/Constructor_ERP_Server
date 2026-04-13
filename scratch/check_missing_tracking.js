const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const poCount = await prisma.purchaseOrder.count({ where: { status: 'issued' } });
    const dtCount = await prisma.deliveryTracking.count();
    const pos = await prisma.purchaseOrder.findMany({
        where: { status: 'issued' },
        select: { id: true, po_number: true, created_at: true }
    });
    const dts = await prisma.deliveryTracking.findMany({
        select: { po_id: true }
    });

    console.log('--- ISSUED POs ---');
    console.log('Count:', poCount);
    pos.forEach(p => console.log(`- ${p.po_number} (${p.id})`));

    console.log('\n--- DELIVERY TRACKING ---');
    console.log('Count:', dtCount);
    dts.forEach(d => console.log(`- Linked PO ID: ${d.po_id}`));

    const missing = pos.filter(p => !dts.some(d => d.po_id === p.id));
    console.log('\n--- POs MISSING TRACKING ---');
    missing.forEach(p => console.log(`- ${p.po_number}`));
}

check().finally(() => prisma.$disconnect());
