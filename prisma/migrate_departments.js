require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    console.log('Starting data migration mapping department to department_id...');

    // 1. Gather distinct departments
    const users = await prisma.user.findMany({ select: { department: true }, distinct: ['department'] });
    const matrices = await prisma.approvalMatrix.findMany({ select: { department: true }, distinct: ['department'] });
    const requests = await prisma.approvalRequest.findMany({ select: { department: true }, distinct: ['department'] });

    const allDepts = new Set([
        ...users.map(u => u.department),
        ...matrices.map(m => m.department),
        ...requests.map(r => r.department)
    ]);

    for (const deptString of allDepts) {
        if (!deptString) continue;

        const deptCode = deptString.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Create or find Department
        let department = await prisma.department.findUnique({ where: { code: deptCode } });
        if (!department) {
            department = await prisma.department.create({
                data: {
                    code: deptCode,
                    name: deptString,
                    description: `Migrated from legacy string field: ${deptString}`
                }
            });
            console.log(`Created Department: ${department.name} (ID: ${department.id})`);
        } else {
            console.log(`Department already exists: ${department.name} (ID: ${department.id})`);
        }

        // Update records mapped to this string
        const userUpdate = await prisma.user.updateMany({
            where: { department: deptString, department_id: null },
            data: { department_id: department.id }
        });
        console.log(` - Updated ${userUpdate.count} Users for ${deptString}.`);

        const matrixUpdate = await prisma.approvalMatrix.updateMany({
            where: { department: deptString, department_id: null },
            data: { department_id: department.id }
        });
        console.log(` - Updated ${matrixUpdate.count} ApprovalMatrices for ${deptString}.`);

        const reqUpdate = await prisma.approvalRequest.updateMany({
            where: { department: deptString, department_id: null },
            data: { department_id: department.id }
        });
        console.log(` - Updated ${reqUpdate.count} ApprovalRequests for ${deptString}.`);
    }

    console.log('Data migration completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
