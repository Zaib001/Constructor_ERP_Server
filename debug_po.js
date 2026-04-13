const { getAllPurchaseOrders } = require('./src/modules/purchaseOrders/purchaseOrders.service');
const prisma = require('./src/db');

async function debug() {
    try {
        // Find a valid user to test with
        const user = await prisma.user.findFirst({
            where: { is_active: true }
        });
        
        if (!user) {
            console.error('No active user found for testing');
            return;
        }

        console.log('Testing with user:', user.email);
        
        // Mock user object as it would come from req.user
        const mockUser = {
            id: user.id,
            companyId: user.company_id,
            isSuperAdmin: false // Assume typical ERP Admin
        };

        const result = await getAllPurchaseOrders(mockUser);
        console.log('Success!', result.length, 'POs found');
    } catch (err) {
        console.error('CAUGHT ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
