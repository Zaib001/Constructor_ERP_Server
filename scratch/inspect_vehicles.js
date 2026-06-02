require('dotenv').config();
const prisma = require('../src/db');

async function main() {
  console.log('🚗 Querying existing vehicles in DB...');
  const vehicles = await prisma.vehicle.findMany();
  console.log(`Total vehicles in DB: ${vehicles.length}`);
  if (vehicles.length > 0) {
    console.log('Sample vehicles in DB:');
    console.dir(vehicles.slice(0, 5), { depth: null });
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
