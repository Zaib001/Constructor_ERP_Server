require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dashboardService = require('./src/modules/dashboard/dashboard.service');

async function test() {
  console.log('Testing Project Dashboard for Superadmin...');
  const mockUser = {
    id: 'e2844a4a-316b-4598-8721-0cf156bd6ed3', // Dummy UUID
    isSuperAdmin: true,
    roleCode: 'super_admin'
  };

  try {
    const data = await dashboardService.getProjectDashboard(mockUser);
    console.log('Success! Project Dashboard data returned.');
    process.exit(0);
  } catch (err) {
    console.error('FAILED with error:');
    console.error(err);
    process.exit(1);
  }
}

test();
