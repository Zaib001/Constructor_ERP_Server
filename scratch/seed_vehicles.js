require('dotenv').config();
const prisma = require('../src/db');

// Load parsed vehicles
const parsedVehicles = require('./parsed_vehicles.json');

async function main() {
  console.log('🧹 Step 1: Cleaning up existing vehicles to ensure idempotency...');
  
  const vehicleCodes = parsedVehicles.map(v => v.vehicle_no);
  const plateNos = parsedVehicles.map(v => v.plate_no).filter(Boolean);

  // Find existing vehicles matching code or plate number
  const existingVehicles = await prisma.vehicle.findMany({
    where: {
      OR: [
        { vehicle_no: { in: vehicleCodes } },
        { plate_no: { in: plateNos } }
      ]
    },
    select: { id: true, vehicle_no: true, plate_no: true }
  });

  if (existingVehicles.length > 0) {
    const existingIds = existingVehicles.map(v => v.id);
    console.log(`   Found ${existingVehicles.length} existing vehicle(s). Deleting references...`);
    
    // Delete related petrol expenses
    const deletedExpenses = await prisma.petrolExpense.deleteMany({
      where: { vehicle_id: { in: existingIds } }
    });
    console.log(`   ✅ Deleted ${deletedExpenses.count} related petrol expense(s).`);

    // Delete vehicles
    const deletedVehicles = await prisma.vehicle.deleteMany({
      where: { id: { in: existingIds } }
    });
    console.log(`   ✅ Deleted ${deletedVehicles.count} existing vehicle(s).`);
  } else {
    console.log('   No existing matching vehicles found.');
  }

  console.log(`\n🚗 Step 2: Seeding ${parsedVehicles.length} vehicles (company_id: null)...`);
  let seededCount = 0;
  const errors = [];

  for (const veh of parsedVehicles) {
    try {
      const created = await prisma.vehicle.create({
        data: {
          vehicle_no: veh.vehicle_no,
          plate_no: veh.plate_no,
          brand: veh.brand,
          insurance_expiry: veh.insurance_expiry ? new Date(veh.insurance_expiry) : null,
          registration_expiry: veh.registration_expiry ? new Date(veh.registration_expiry) : null,
          service_interval: veh.service_interval,
          odometer_reading: veh.odometer_reading,
          insurance_details: veh.insurance_details,
          company_id: null, // Scoped globally (without specific company assignment)
        }
      });
      seededCount++;
      console.log(`   ✓ ${created.vehicle_no} — ${created.brand} (${created.plate_no})`);
    } catch (err) {
      errors.push({ vehicle_no: veh.vehicle_no, error: err.message });
      console.error(`   ❌ Failed to seed ${veh.vehicle_no}: ${err.message}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('🎉 Seeding complete!');
  console.log(`   ✅ Vehicles seeded: ${seededCount} / ${parsedVehicles.length}`);
  console.log(`   ⚠️  Errors:          ${errors.length}`);
  if (errors.length > 0) {
    console.log('\n   Failed records:');
    errors.forEach(e => console.log(`     - ${e.vehicle_no}: ${e.error}`));
  }
  console.log('══════════════════════════════════════════════════════\n');
}

main()
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
