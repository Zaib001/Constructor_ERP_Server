const prisma = require('./src/db'); 
const fs = require('fs');
async function main() { 
  try {
    const quotes = await prisma.approvalRequest.findMany({ 
        where: { doc_type: 'Quotation' }, 
        select: { doc_id: true, current_status: true, current_step: true, amount: true, is_completed: true } 
    }); 
    const pos = await prisma.approvalRequest.findMany({ 
        where: { doc_type: 'PO' }, 
        select: { doc_id: true, current_status: true, current_step: true, amount: true, is_completed: true } 
    }); 
    fs.writeFileSync('check_quotes_out.json', JSON.stringify({quotes, pos}, null, 2));
    console.log("Done");
  } catch (err) {
    fs.writeFileSync('check_quotes_out.json', err.message);
  }
} 
main().finally(()=>process.exit());
