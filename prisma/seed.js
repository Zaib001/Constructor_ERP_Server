require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../src/db');

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // 1. Seed Company
    const company = await prisma.company.upsert({
      where: { code: 'CORP-001' },
      update: {},
      create: {
        code: 'CORP-001',
        name: 'Construction ERP Demo Company',
        address: '123 Business Park, Industrial City',
        phone: '+966-12-123-4567',
        email: 'info@constructionerp.com',
        is_active: true,
        registration_number: 'CR-2025-001',
        vat_number: 'VAT-2025-001',
      },
    });
    console.log('✅ Company seeded:', company.id);

    // 2. Seed Role
    const role = await prisma.role.upsert({
      where: { code: 'ENGINEER' },
      update: {},
      create: {
        code: 'ENGINEER',
        name: 'Site Engineer',
        description: 'Site Engineer role',
        is_system_role: false,
        is_active: true,
      },
    });
    console.log('✅ Role seeded:', role.id);

    // 2a. Assign ALL permissions to the ENGINEER role
    const allPermissions = await prisma.permission.findMany();
    if (allPermissions.length > 0) {
      // Remove existing role permissions first to avoid duplicates
      await prisma.rolePermission.deleteMany({ where: { role_id: role.id } });
      // Re-assign all permissions
      await prisma.rolePermission.createMany({
        data: allPermissions.map((p) => ({
          role_id: role.id,
          permission_id: p.id,
        })),
        skipDuplicates: true,
      });
      console.log(`✅ Assigned ${allPermissions.length} permissions to ENGINEER role`);
    } else {
      console.log('⚠️  No permissions found in DB — skipping role-permission assignment');
    }


    // 3. Seed Department
    const department = await prisma.department.upsert({
      where: { code: 'PROCUREMENT' },
      update: {},
      create: {
        code: 'PROCUREMENT',
        name: 'Procurement Department',
        description: 'Handles all procurement activities',
        is_active: true,
        company_id: company.id,
      },
    });
    console.log('✅ Department seeded:', department.id);

    // 4. Seed User (Engineer)
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const user = await prisma.user.upsert({
      where: { email: 'engineer@erp.com' },
      update: {
        name: 'John Engineer',
        password_hash: passwordHash,
        employee_code: 'ENG-001',
        designation: 'Site Engineer',
        is_active: true,
        company_id: company.id,
        department_id: department.id,
        role_id: role.id,
      },
      create: {
        name: 'John Engineer',
        email: 'engineer@erp.com',
        phone: '+966-50-123-4567',
        password_hash: passwordHash,
        employee_code: 'ENG-001',
        designation: 'Site Engineer',
        is_active: true,
        company_id: company.id,
        department_id: department.id,
        role_id: role.id,
      },
    });
    console.log('✅ User (Engineer) seeded:', user.id);

    // 5. Seed Project
    const project = await prisma.project.upsert({
      where: { code: 'PROJ-001' },
      update: {},
      create: {
        code: 'PROJ-001',
        name: 'Metro Station Construction',
        description: 'Main construction project for metro station',
        status: 'active',
        start_date: new Date('2025-01-01'),
        end_date: new Date('2025-12-31'),
        budget: 5000000,
        revenue: 5000000,
        company_id: company.id,
        location: 'Downtown',
        client: 'Metro Authority',
        contract_value: 5000000,
      },
    });
    console.log('✅ Project seeded:', project.id);

    // --- CLEANUP SECTION ---
    console.log('🧹 Cleaning up existing seed data for Company CORP-001...');

    // Deletions in dependency order
    await prisma.dPRItem.deleteMany({ where: { dpr: { company_id: company.id } } });
    await prisma.dPR.deleteMany({ where: { company_id: company.id } });

    await prisma.bOQItem.deleteMany({ where: { company_id: company.id } });

    await prisma.materialIssueItem.deleteMany({ where: { issue: { company_id: company.id } } });
    await prisma.materialIssue.deleteMany({ where: { company_id: company.id } });

    await prisma.stockLedger.deleteMany({ where: { company_id: company.id } });

    // Delete GRN items via both paths to avoid FK constraint violations
    await prisma.gRNItem.deleteMany({ where: { grn: { company_id: company.id } } });
    await prisma.gRNItem.deleteMany({ where: { po_item: { purchase_order: { company_id: company.id } } } });
    await prisma.goodsReceiptNote.deleteMany({ where: { company_id: company.id } });

    await prisma.purchaseOrderItem.deleteMany({ where: { purchase_order: { company_id: company.id } } });
    await prisma.purchaseOrder.deleteMany({ where: { company_id: company.id } });

    await prisma.vendorQuoteItem.deleteMany({ where: { quote: { vendor: { company_id: company.id } } } });
    await prisma.vendorQuote.deleteMany({ where: { vendor: { company_id: company.id } } });

    await prisma.rFQVendor.deleteMany({ where: { rfq: { requisition: { company_id: company.id } } } });
    await prisma.rFQ.deleteMany({ where: { requisition: { company_id: company.id } } });

    await prisma.purchaseRequisitionItem.deleteMany({ where: { requisition: { company_id: company.id } } });
    await prisma.purchaseRequisition.deleteMany({ where: { company_id: company.id } });

    await prisma.vendor.deleteMany({ where: { company_id: company.id } });
    await prisma.inventoryStock.deleteMany({ where: { company_id: company.id } });
    await prisma.store.deleteMany({ where: { company_id: company.id } });
    await prisma.item.deleteMany({ where: { company_id: company.id } });

    await prisma.costCode.deleteMany({ where: { wbs: { project: { company_id: company.id } } } });
    await prisma.wBS.deleteMany({ where: { project: { company_id: company.id } } });

    console.log('✅ Cleanup complete!');

    // 6. Seed WBS (Work Breakdown Structure)
    const wbs = await prisma.wBS.create({
      data: {
        project_id: project.id,
        wbs_code: 'WBS-001',
        name: 'Foundation Work',
        status: 'active',
        weight_pct: 25,
      },
    });
    console.log('✅ WBS seeded:', wbs.id);

    // 7. Seed CostCode
    const costCode = await prisma.costCode.create({
      data: {
        wbs_id: wbs.id,
        category: 'material',
        budget_amount: 1000000,
      },
    });
    console.log('✅ CostCode seeded:', costCode.id);

    // 8. Seed Items (Catalog)
    const items = await Promise.all([
      prisma.item.create({
        data: {
          name: 'Portland Cement 50kg',
          category: 'Raw Materials',
          unit: 'Bag',
          description: 'High quality Portland cement for construction',
          company_id: company.id,
          standard_price: 450,
        },
      }),
      prisma.item.create({
        data: {
          name: 'River Sand',
          category: 'Raw Materials',
          unit: 'Ton',
          description: 'Fine river sand for construction',
          company_id: company.id,
          standard_price: 1200,
        },
      }),
      prisma.item.create({
        data: {
          name: 'Red Brick',
          category: 'Building Materials',
          unit: 'Piece',
          description: 'Standard red brick 9x4x3 inches',
          company_id: company.id,
          standard_price: 8.5,
        },
      }),
      prisma.item.create({
        data: {
          name: 'Reinforcement Steel TMT Bar 16mm',
          category: 'Steel',
          unit: 'Ton',
          description: 'Thermo-Mechanically Treated steel rebar',
          company_id: company.id,
          standard_price: 45000,
        },
      }),
      prisma.item.create({
        data: {
          name: 'Exterior Paint 20L',
          category: 'Finishing Materials',
          unit: 'Liter',
          description: 'Acrylic exterior paint',
          company_id: company.id,
          standard_price: 350,
        },
      }),
      prisma.item.create({
        data: {
          name: 'Ceramic Floor Tile 60x60cm',
          category: 'Finishing Materials',
          unit: 'Box',
          description: 'Premium ceramic floor tiles',
          company_id: company.id,
          standard_price: 2500,
        },
      }),
    ]);
    console.log('✅ Items seeded:', items.length);

    // 9. Seed Stores
    const stores = await Promise.all([
      prisma.store.create({
        data: {
          company_id: company.id,
          name: 'Main Warehouse',
          location: 'Industrial Area',
          description: 'Main storage warehouse',
          is_active: true,
          store_keeper_id: user.id,
        },
      }),
      prisma.store.create({
        data: {
          company_id: company.id,
          name: 'Site Store - Project A',
          location: 'Downtown',
          description: 'On-site storage for main project',
          is_active: true,
          store_keeper_id: user.id,
        },
      }),
      prisma.store.create({
        data: {
          company_id: company.id,
          name: 'Secondary Warehouse',
          location: 'Suburbs',
          description: 'Secondary storage facility',
          is_active: true,
        },
      }),
    ]);
    console.log('✅ Stores seeded:', stores.length);

    // 10. Seed Inventory Stock
    const stocks = [];
    for (const store of stores) {
      for (const item of items) {
        const stock = await prisma.inventoryStock.create({
          data: {
            company_id: company.id,
            store_id: store.id,
            item_id: item.id,
            quantity: Math.floor(Math.random() * 500) + 50,
          },
        });
        stocks.push(stock);
      }
    }
    console.log('✅ Inventory stocks seeded:', stocks.length);

    // 11. Seed Vendor
    const vendor = await prisma.vendor.create({
      data: {
        company_id: company.id,
        department_id: department.id,
        name: 'Quality Building Materials Supplier',
        email: 'vendor@supplier.com',
        phone: '+966-12-987-6543',
        contact_person: 'Ahmed Al-Mansouri',
        address: '456 Industrial Road, Supply City',
        category: 'Building Materials',
        status: 'pending',
        created_by: user.id,
      },
    });
    console.log('✅ Vendor seeded:', vendor.id);

    // 12. Seed Purchase Requisition
    const pr = await prisma.purchaseRequisition.create({
      data: {
        pr_no: 'PR-2025-001',
        company_id: company.id,
        project_id: project.id,
        wbs_id: wbs.id,
        requested_by: user.id,
        reason: 'Foundation work materials required',
        status: 'draft',
        purchaseRequisitionItems: {
          create: [
            {
              item_id: items[0].id,
              quantity: 100,
              required_date: new Date('2025-02-15'),
              remarks: 'For concrete foundation',
              estimated_unit_price: 450,
              estimated_total_price: 45000,
            },
            {
              item_id: items[1].id,
              quantity: 50,
              required_date: new Date('2025-02-15'),
              remarks: 'For concrete mix',
              estimated_unit_price: 1200,
              estimated_total_price: 60000,
            },
            {
              item_id: items[3].id,
              quantity: 10,
              required_date: new Date('2025-02-15'),
              remarks: 'For reinforcement',
              estimated_unit_price: 45000,
              estimated_total_price: 450000,
            },
          ],
        },
      },
      include: {
        purchaseRequisitionItems: true,
      },
    });
    console.log('✅ Purchase Requisition seeded:', pr.id);

    // 13. Seed RFQ
    const rfq = await prisma.rFQ.create({
      data: {
        rfq_no: 'RFQ-2025-001',
        requisition_id: pr.id,
        created_by: user.id,
        quote_deadline: new Date('2025-02-01'),
        status: 'draft',
      },
    });
    console.log('✅ RFQ seeded:', rfq.id);

    // 14. Seed RFQ Vendor
    await prisma.rFQVendor.create({
      data: {
        rfq_id: rfq.id,
        vendor_id: vendor.id,
        response_status: 'pending',
      },
    });
    console.log('✅ RFQ Vendor seeded');

    // 15. Seed Vendor Quote
    const quote = await prisma.vendorQuote.create({
      data: {
        rfq_id: rfq.id,
        vendor_id: vendor.id,
        validity_date: new Date('2025-02-28'),
        delivery_days: 7,
        status: 'submitted',
        items: {
          create: [
            {
              item_id: items[0].id,
              unit_price: 440,
              quantity: 100,
              total_price: 44000,
            },
            {
              item_id: items[1].id,
              unit_price: 1180,
              quantity: 50,
              total_price: 59000,
            },
            {
              item_id: items[3].id,
              unit_price: 44800,
              quantity: 10,
              total_price: 448000,
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });
    console.log('✅ Vendor Quote seeded:', quote.id);

    // 16. Seed Purchase Order
    const po = await prisma.purchaseOrder.create({
      data: {
        po_number: 'PO-2025-001',
        company_id: company.id,
        department_id: department.id,
        project_id: project.id,
        vendor_id: vendor.id,
        requisition_id: pr.id,
        rfq_id: rfq.id,
        quote_id: quote.id,
        amount: 551000,
        status: 'draft',
        delivery_status: 'pending',
        created_by: user.id,
        delivery_terms: 'FOB',
        payment_terms: '30 days Net',
        subtotal: 551000,
        vat_amount: 82650,
        total_amount: 633650,
        items: {
          create: [
            {
              item_name: 'Portland Cement 50kg',
              description: 'High quality Portland cement',
              quantity: 100,
              unit: 'Bag',
              unit_price: 440,
              total_price: 44000,
              item_id: items[0].id,
            },
            {
              item_name: 'River Sand',
              description: 'Fine river sand',
              quantity: 50,
              unit: 'Ton',
              unit_price: 1180,
              total_price: 59000,
              item_id: items[1].id,
            },
            {
              item_name: 'Reinforcement Steel TMT Bar 16mm',
              description: 'Steel reinforcement',
              quantity: 10,
              unit: 'Ton',
              unit_price: 44800,
              total_price: 448000,
              item_id: items[3].id,
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });
    console.log('✅ Purchase Order seeded:', po.id);

    // 17. Seed GoodsReceiptNote (GRN)
    const grn = await prisma.goodsReceiptNote.create({
      data: {
        company_id: company.id,
        grn_no: 'GRN-2025-001',
        po_id: po.id,
        store_id: stores[0].id,
        received_by: user.id,
        vendor_dn: 'DN-2025-001',
        remarks: 'All items received in good condition',
        items: {
          create: po.items.map((item) => ({
            po_item_id: item.id,
            item_id: item.item_id,
            qty_received: item.quantity,
            unit_price: item.unit_price,
          })),
        },
      },
      include: {
        items: true,
      },
    });
    console.log('✅ Goods Receipt Note seeded:', grn.id);

    // 18. Seed Stock Ledger entries
    for (const grnItem of grn.items) {
      await prisma.stockLedger.create({
        data: {
          company_id: company.id,
          item_id: grnItem.item_id,
          store_id: stores[0].id,
          move_type: 'GRN_IN',
          quantity: grnItem.qty_received,
          reference_id: grn.id,
          created_by: user.id,
        },
      });
    }
    console.log('✅ Stock Ledger entries seeded');

    // 19. Seed Material Issue
    const materialIssue = await prisma.materialIssue.create({
      data: {
        company_id: company.id,
        issue_no: 'MI-2025-001',
        project_id: project.id,
        wbs_id: wbs.id,
        store_id: stores[0].id,
        issued_by: user.id,
        items: {
          create: [
            {
              item_id: items[0].id,
              cost_code_id: costCode.id,
              quantity: 50,
              unit_cost: 440,
            },
            {
              item_id: items[1].id,
              cost_code_id: costCode.id,
              quantity: 25,
              unit_cost: 1180,
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });
    console.log('✅ Material Issue seeded:', materialIssue.id);

    // 20. Seed BOQ Items
    const boqItems = await Promise.all([
      prisma.bOQItem.create({
        data: {
          company_id: company.id,
          project_id: project.id,
          wbs_id: wbs.id,
          item_code: 'BOQ-001',
          description: 'Foundation excavation and preparation',
          unit: 'm³',
          planned_qty: 500,
          unit_rate: 150,
          total_amount: 75000,
          created_by: user.id,
        },
      }),
      prisma.bOQItem.create({
        data: {
          company_id: company.id,
          project_id: project.id,
          wbs_id: wbs.id,
          item_code: 'BOQ-002',
          description: 'Concrete foundation work',
          unit: 'm³',
          planned_qty: 200,
          unit_rate: 800,
          total_amount: 160000,
          created_by: user.id,
        },
      }),
    ]);
    console.log('✅ BOQ Items seeded:', boqItems.length);

    // 21. Seed DPR (Daily Progress Report)
    const dpr = await prisma.dPR.create({
      data: {
        company_id: company.id,
        project_id: project.id,
        dpr_no: 'DPR-2025-001',
        report_date: new Date('2025-01-15'),
        weather: 'Clear',
        shift: 'day',
        status: 'draft',
        executive_summary: 'Foundation work progressing as planned',
        safety_note: 'No safety incidents',
        created_by: user.id,
        items: {
          create: [
            {
              wbs_id: wbs.id,
              boq_item_id: boqItems[0].id,
              description: 'Foundation excavation',
              unit: 'm³',
              planned_today_qty: 50,
              actual_today_qty: 45,
              cumulative_planned: 50,
              cumulative_actual: 45,
              progress_pct: 9,
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });
    console.log('✅ DPR seeded:', dpr.id);

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`  ✓ Company: ${company.code}`);
    console.log(`  ✓ User (Engineer): ${user.email}`);
    console.log(`  ✓ Project: ${project.code}`);
    console.log(`  ✓ Items: ${items.length}`);
    console.log(`  ✓ Stores: ${stores.length}`);
    console.log(`  ✓ Inventory Stocks: ${stocks.length}`);
    console.log(`  ✓ Purchase Requisition: ${pr.pr_no}`);
    console.log(`  ✓ Purchase Order: ${po.po_number}`);
    console.log(`  ✓ GRN: ${grn.grn_no}`);
    console.log(`  ✓ Material Issue: ${materialIssue.issue_no}`);
    console.log(`  ✓ BOQ Items: ${boqItems.length}`);
    console.log(`  ✓ DPR: ${dpr.dpr_no}`);

  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();