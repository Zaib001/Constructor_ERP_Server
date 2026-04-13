require('dotenv').config();
const prisma = require('./src/db');

async function seed() {
  const projectId = '2bba9245-0574-4ee3-920a-08978509894f'; // NEOM Square Infrastructure
  const companyId = 'b5a9e2db-661c-481f-a83e-f173abc42e2e'; // The user's company

  // Existing WBS IDs:
  const wbsMobilization = 'ee175f32-0d8b-47cd-98a2-b2173eb88f04';
  const wbsFoundations = 'b0132cfa-c443-405b-b6cd-c9237e84f810';
  const wbsEarthworks = '11ef0161-052c-4dd9-aa9b-37d45cc46f30';

  const mockItems = [
    {
      item_code: 'BOQ-CIV-001',
      description: 'Site Mobilization & Temporary Office Setup',
      planned_qty: 1,
      unit: 'LS',
      unit_rate: 150000,
      total_amount: 150000,
      wbs_id: wbsMobilization
    },
    {
      item_code: 'BOQ-CIV-002',
      description: 'Mass Excavation for Foundation Pit (Soft Rock)',
      planned_qty: 5000,
      unit: 'm3',
      unit_rate: 45,
      total_amount: 225000,
      wbs_id: wbsEarthworks
    },
    {
      item_code: 'BOQ-CONC-001',
      description: 'Grade 30 Structural Concrete for Footings',
      planned_qty: 1200,
      unit: 'm3',
      unit_rate: 650,
      total_amount: 780000,
      wbs_id: wbsFoundations
    },
    {
      item_code: 'BOQ-MEP-001',
      description: 'Main Distribution Board (MDB-A1) Supply',
      planned_qty: 2,
      unit: 'SET',
      unit_rate: 45000,
      total_amount: 90000,
      wbs_id: wbsMobilization
    }
  ];

  try {
    console.log('Seeding Mock BOQ Items for NEOM project...');
    
    // Clear existing if any
    const deleted = await prisma.bOQItem.deleteMany({
      where: { project_id: projectId, company_id: companyId }
    });
    console.log(`Cleared ${deleted.count} old items.`);

    const created = await prisma.bOQItem.createMany({
      data: mockItems.map(item => ({
        ...item,
        project_id: projectId,
        company_id: companyId
      }))
    });

    console.log(`Successfully seeded ${created.count} BOQ items.`);
  } catch (err) {
    console.error('Seeding Failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
