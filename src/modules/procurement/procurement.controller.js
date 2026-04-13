const procurementService = require('./procurement.service');
const logger = require('../../logger');

async function listInvoices(req, res, next) {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ success: false, message: 'project_id is required' });
    }

    const invoices = await procurementService.listSupplierInvoices(project_id);
    
    // Map internal fields to match frontend expectations if needed
    const mappedInvoices = invoices.map(inv => ({
      ...inv,
      invoice_no: inv.invoice_number, // Frontend expects invoice_no
    }));

    res.json({
      success: true,
      data: mappedInvoices,
      requestId: req.context?.requestId
    });
  } catch (error) {
    logger.error('Error listing procurement invoices:', error);
    next(error);
  }
}

module.exports = {
  listInvoices
};
