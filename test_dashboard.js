const prisma = require('./src/db');
async function test() {
    try {
        const c = await prisma.approvalRequest.count({
            where: { company_id: 'some-uid', is_completed: false }
        });
        console.log(c);
    } catch(e) {
        console.error("error:", e.message);
    }
}
test().finally(()=>process.exit(0));
