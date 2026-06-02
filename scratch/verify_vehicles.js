require('dotenv').config();
const prisma = require('../src/db');
const { getAllVehicles, getVehicleById } = require('../src/modules/vehicles/vehicles.service');

async function main() {
  console.log('🧪 Verifying seeded vehicles and service layer retrieval...');

  // Mock standard user scoped to CORP-001 company (Construction ERP Demo Company)
  const mockUser = {
    companyId: 'c757c5dc-3cdf-4f70-9ed3-082f1268f10e', // CORP-001
    isSuperAdmin: false,
    roleCode: 'fleet_manager',
    id: 'mock-user-id'
  };

  console.log('\n1. Testing getAllVehicles (page=1, pageSize=50)...');
  const result = await getAllVehicles(mockUser, null, null, 1, 50);
  console.log(`   Total vehicles returned: ${result.total}`);
  
  const nullCompanyCount = result.data.filter(v => v.company_id === null).length;
  console.log(`   Vehicles with company_id = null: ${nullCompanyCount}`);

  if (result.data.length > 0) {
    console.log('\n2. Testing getVehicleById on first returned vehicle...');
    const firstVehicle = result.data[0];
    const retrieved = await getVehicleById(firstVehicle.id, mockUser);
    if (retrieved && retrieved.id === firstVehicle.id) {
      console.log(`   ✅ Successfully retrieved: [${retrieved.vehicle_no}] ${retrieved.brand} (Plate: ${retrieved.plate_no})`);
      console.log(`      Company ID: ${retrieved.company_id}`);
      console.log(`      Details: ${retrieved.insurance_details}`);
    } else {
      console.error('   ❌ Failed to retrieve vehicle by ID.');
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
