const prisma = require('../../db');

async function listSupplierInvoices(projectId) {
  return prisma.supplierInvoice.findMany({
    where: {
      purchase_order: {
        project_id: projectId
      }
    },
    include: {
      vendor: {
        select: {
          name: true
        }
      },
      purchase_order: {
        select: {
          po_number: true
        }
      }
    },
    orderBy: {
      invoice_date: 'desc'
    }
  });
}

module.exports = {
  listSupplierInvoices
};
