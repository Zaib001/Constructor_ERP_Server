require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const p = await prisma.project.findFirst();
    if (!p) { console.log('No project found'); await prisma.$disconnect(); return; }
    console.log('Testing with project:', p.id, p.name);
    
    try {
        const r = await prisma.purchaseRequisitionItem.aggregate({
            where: { requisition: { project_id: p.id, status: { in: ['approved_for_rfq', 'submitted'] } } },
            _sum: { estimated_total_price: true }
        });
        console.log('PR items OK:', r._sum);
    } catch(e) { console.error('PR items FAIL:', e.message); }

    try {
        const r = await prisma.pettyCashRequest.aggregate({
            where: { project_id: p.id, status: { in: ['approved', 'settled'] } },
            _sum: { estimated_cost: true }
        });
        console.log('PettyCash OK:', r._sum);
    } catch(e) { console.error('PettyCash FAIL:', e.message); }

    try {
        const r = await prisma.petrolExpense.aggregate({
            where: { project_id: p.id, status: { in: ['verified', 'approved'] } },
            _sum: { total_amount: true }
        });
        console.log('Petrol OK:', r._sum);
    } catch(e) { console.error('Petrol FAIL:', e.message); }

    try {
        const r = await prisma.payroll.aggregate({
            where: { project_id: p.id, status: { in: ['processed', 'approved', 'paid'] } },
            _sum: { total_amount: true }
        });
        console.log('Payroll OK:', r._sum);
    } catch(e) { console.error('Payroll FAIL:', e.message); }

    await prisma.$disconnect();
}

test().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
