require('dotenv').config();
const prisma = require('./src/db');
const timesheetService = require('./src/modules/execution/resources/timesheet.service');

async function main() {
    try {
        const companyId = 'b5a9e2db-661c-481f-a83e-f173abc42e2e'; // MainCo 
        const projectId = '2bba9245-0574-4ee3-920a-08978509894f'; // from the URL request
        console.log("Calling listActiveResources...");
        const result = await timesheetService.listActiveResources({ project_id: projectId, status: 'active' }, companyId);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("SERVICE ERROR:", e.message);
        console.error(e.stack);
    } finally {
        await prisma.$disconnect();
    }
}
main();
