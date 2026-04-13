const prisma = require('../../../db');
const { Prisma } = require('@prisma/client');

// ─── Delay Records ────────────────────────────────────────────────────────────
async function createDelay(data, userId, companyId) {
  const count = await prisma.delayRecord.count({ where: { company_id: companyId } });
  const delay_ref = `DLY-${String(count + 1).padStart(4, '0')}`;
  
  const payloadDetails = { ...data };
  if (!payloadDetails.wbs_id) delete payloadDetails.wbs_id;
  if (!payloadDetails.cause) payloadDetails.cause = 'CONTRACTOR';

  return prisma.delayRecord.create({
    data: { ...payloadDetails, company_id: companyId, delay_ref, created_by: userId, start_date: new Date(data.start_date), ...(data.end_date && { end_date: new Date(data.end_date) }) },
    include: { wbs: { select: { id: true, name: true, wbs_code: true } } }
  });
}

async function listDelays({ project_id, status, delay_type, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(delay_type && { delay_type }) };
  const [data, total] = await Promise.all([
    prisma.delayRecord.findMany({ where, orderBy: { start_date: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { wbs: { select: { id: true, name: true } }, creator: { select: { id: true, name: true } } } }),
    prisma.delayRecord.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateDelay(id, data) {
  return prisma.$transaction(async (tx) => {
    const delay = await tx.delayRecord.findUnique({ where: { id } });
    if (!delay) throw new Error('Delay record not found');

    // Whitelist valid schema fields to prevent "Unknown argument" errors
    const allowedFields = [
      'delay_type', 'cause', 'description', 'status', 
      'resolution_notes', 'eot_days', 'cost_impact', 'delay_days', 'wbs_id',
      'start_date', 'end_date'
    ];
    
    const updates = {};
    allowedFields.forEach(f => {
      if (data[f] !== undefined) updates[f] = data[f];
    });

    if (updates.wbs_id === '') updates.wbs_id = null;

    // Type coercion & Logic fixes
    if (updates.cost_impact  !== undefined) updates.cost_impact  = Number(updates.cost_impact  || 0);
    if (updates.eot_days     !== undefined) updates.eot_days     = Math.round(Number(updates.eot_days || 0));
    if (updates.delay_days   !== undefined) updates.delay_days   = Math.round(Number(updates.delay_days || 0));
    
    if (updates.eot_days > 0) updates.eot_claimed = true;

    const updatedDelay = await tx.delayRecord.update({
      where: { id },
      data: {
        ...updates,
        ...(updates.start_date && { start_date: new Date(updates.start_date) }),
        ...(updates.end_date === '' ? { end_date: null } : (updates.end_date ? { end_date: new Date(updates.end_date) } : {})),
      }
    });

    // If resolving, sync impact to Project Master Data
    if (updates.status === 'resolved') {
      const project = await tx.project.findUnique({ where: { id: delay.project_id } });
      if (project) {
        let projectUpdates = {};
        
        if (updates.cost_impact) {
          const currentVal = Number(project.current_contract_value || project.contract_value || 0);
          projectUpdates.current_contract_value = currentVal + Number(updates.cost_impact);
        }

        if (updates.eot_days) {
          const currentForecast = project.forecast_end_date || project.end_date || new Date();
          const newForecast = new Date(currentForecast);
          newForecast.setDate(newForecast.getDate() + Number(updates.eot_days));
          projectUpdates.forecast_end_date = newForecast;
        }

        if (Object.keys(projectUpdates).length > 0) {
          await tx.project.update({
            where: { id: delay.project_id },
            data: projectUpdates
          });
        }
      }
    }

    return updatedDelay;
  });
}


// ─── Variation Orders ─────────────────────────────────────────────────────────
async function createVariationOrder(data, userId, companyId) {
  const count = await prisma.variationOrder.count({ where: { company_id: companyId } });
  const vo_no = `VO-${String(count + 1).padStart(4, '0')}`;
  const { items = [], title, ...rawVOData } = data; // Strip 'title' explicitly if it exists due to stale front-end caches
  
  // Clean any empty strings that might break UUID fields
  const voData = { ...rawVOData };
  if (!voData.delay_ref_id) delete voData.delay_ref_id;
  if (!voData.approved_by) delete voData.approved_by;

  const revised_contract_value = Number(voData.original_contract_value) + Number(voData.variation_amount);

  return prisma.variationOrder.create({
    data: {
      ...voData, company_id: companyId, vo_no, revised_contract_value, created_by: userId,
      ...(voData.submitted_at && { submitted_at: new Date(voData.submitted_at) }),
      items: { create: items.map(i => ({ ...i, total_amount: Number(i.quantity) * Number(i.unit_rate) })) }
    },
    include: { items: true, creator: { select: { id: true, name: true } } }
  });
}

async function listVariationOrders({ project_id, status, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }) };
  const [data, total] = await Promise.all([
    prisma.variationOrder.findMany({ where, orderBy: { created_at: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { items: true, creator: { select: { id: true, name: true } }, approver: { select: { id: true, name: true } } } }),
    prisma.variationOrder.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function approveVariationOrder(id, userId, action) {
  const vo = await prisma.variationOrder.findUnique({ where: { id } });
  if (!vo) throw new Error('Variation Order not found');

  return prisma.$transaction(async (tx) => {
    const updatedVO = await tx.variationOrder.update({
      where: { id },
      data: { 
        status: action === 'approve' ? 'approved' : 'rejected', 
        approved_by: action === 'approve' ? userId : null, 
        approved_at: action === 'approve' ? new Date() : null 
      }
    });

    if (action === 'approve') {
        const project = await tx.project.findUnique({ where: { id: vo.project_id } });
        if (!project) throw new Error('Associated project not found for this Variation Order');
        
        const currentVal = Number(project.current_contract_value || project.contract_value || 0);
        const newVal = currentVal + Number(vo.variation_amount);
        
        await tx.project.update({
            where: { id: vo.project_id },
            data: { current_contract_value: newVal }
        });

        if (vo.time_impact_days) {
            const currentForecast = project.forecast_end_date || project.end_date || new Date();
            const newForecast = new Date(currentForecast);
            newForecast.setDate(newForecast.getDate() + Number(vo.time_impact_days));
            await tx.project.update({
                where: { id: vo.project_id },
                data: { forecast_end_date: newForecast }
            });
        }
    }
    return updatedVO;
  });
}

// ─── RFI ──────────────────────────────────────────────────────────────────────
async function createRFI(data, userId, companyId) {
  const lastRfi = await prisma.rFI.findFirst({
    where: { company_id: companyId },
    orderBy: { rfi_no: 'desc' }
  });
  
  let nextNum = 1;
  if (lastRfi && lastRfi.rfi_no) {
    const lastNum = parseInt(lastRfi.rfi_no.split('-')[1]);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  const rfi_no = `RFI-${String(nextNum).padStart(5, '0')}`;
  
  const payload = {
    project_id: data.project_id,
    subject: data.subject || data.title, // Handle both for safety
    description: data.description,
    priority: data.priority?.toLowerCase() || 'normal',
    to_party: data.to_party || 'CONSULTANT',
    wbs_id: data.wbs_id || null,
    due_date: data.due_date ? new Date(data.due_date) : null
  };
  
  if (!payload.wbs_id) delete payload.wbs_id;

  return prisma.rFI.create({
    data: { 
      ...payload, 
      company_id: companyId, 
      rfi_no, 
      raised_by: userId, 
      created_by: userId 
    }
  });
}

async function listRFIs({ project_id, status, priority, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(priority && { priority }) };
  const [data, total] = await Promise.all([
    prisma.rFI.findMany({ 
      where, 
      orderBy: { created_at: 'desc' }, 
      skip: (Number(page) - 1) * Number(limit), 
      take: Number(limit), 
      include: { 
        raiser: { select: { id: true, name: true } },
        wbs: { select: { id: true, name: true, wbs_code: true } }
      } 
    }),
    prisma.rFI.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateRFI(id, data) {
  return prisma.rFI.update({ 
    where: { id }, 
    data: { 
      ...data, 
      ...(data.due_date && { due_date: new Date(data.due_date) }), 
      ...(data.responded_at && { responded_at: new Date(data.responded_at) }), 
      ...(data.closed_at && { closed_at: new Date(data.closed_at) }) 
    } 
  });
}

async function respondToRFI(id, userId, data) {
  return prisma.rFI.update({
    where: { id },
    data: {
      status: 'responded',
      response: data.response,
      responded_at: new Date(),
      updated_at: new Date()
    }
  });
}

// ─── Submittals ───────────────────────────────────────────────────────────────
async function createSubmittal(data, userId, companyId) {
  const lastSub = await prisma.submittal.findFirst({
    where: { company_id: companyId },
    orderBy: { submittal_no: 'desc' }
  });

  let nextNum = 1;
  if (lastSub && lastSub.submittal_no) {
    const lastNum = parseInt(lastSub.submittal_no.split('-')[1]);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  const submittal_no = `SUB-${String(nextNum).padStart(5, '0')}`;
  
  const payload = {
    project_id: data.project_id,
    title: data.title,
    category: data.category?.toUpperCase().replace(' ', '_'), // Standardize to MATERIAL | SHOP_DRAWING etc
    submitted_to: data.submitted_to || 'CONSULTANT',
    wbs_id: data.wbs_id || null,
    submit_date: data.submit_date ? new Date(data.submit_date) : new Date(),
    required_return: data.required_return ? new Date(data.required_return) : null
  };
  
  if (!payload.wbs_id) delete payload.wbs_id;

  return prisma.submittal.create({
    data: { 
      ...payload, 
      company_id: companyId, 
      submittal_no, 
      submitted_by: userId, 
      created_by: userId 
    }
  });
}

async function listSubmittals({ project_id, status, category, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(category && { category }) };
  const [data, total] = await Promise.all([
    prisma.submittal.findMany({ 
      where, 
      orderBy: { submit_date: 'desc' }, 
      skip: (Number(page) - 1) * Number(limit), 
      take: Number(limit),
      include: {
        wbs: { select: { id: true, name: true, wbs_code: true } }
      }
    }),
    prisma.submittal.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateSubmittal(id, data) {
  return prisma.submittal.update({ 
    where: { id }, 
    data: { 
      ...data, 
      ...(data.submit_date && { submit_date: new Date(data.submit_date) }), 
      ...(data.required_return && { required_return: new Date(data.required_return) }) 
    } 
  });
}

async function reviewSubmittal(id, userId, data) {
  // data.approval_code: A, B, C, D
  let status = 'approved';
  if (data.approval_code === 'C') status = 'revise_resubmit';
  if (data.approval_code === 'D') status = 'rejected';
  if (data.approval_code === 'B') status = 'approved_as_noted';

  return prisma.submittal.update({
    where: { id },
    data: {
      status,
      approval_code: data.approval_code,
      comments: data.comments,
      updated_at: new Date()
    }
  });
}

// ─── Meeting Logs ─────────────────────────────────────────────────────────────
async function createMeeting(data, userId, companyId) {
  const lastMeeting = await prisma.meetingLog.findFirst({
    where: { company_id: companyId },
    orderBy: { meeting_no: 'desc' }
  });

  let nextNum = 1;
  if (lastMeeting && lastMeeting.meeting_no) {
    const lastNum = parseInt(lastMeeting.meeting_no.split('-')[1]);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  const meeting_no = `MOM-${String(nextNum).padStart(5, '0')}`;
  
  const payload = { ...data };
  if (!payload.wbs_id) delete payload.wbs_id;

  return prisma.meetingLog.create({
    data: { 
      ...payload, 
      company_id: companyId, 
      meeting_no, 
      created_by: userId, 
      meeting_date: new Date(data.meeting_date), 
      ...(data.next_meeting && { next_meeting: new Date(data.next_meeting) }) 
    }
  });
}

async function listMeetings({ project_id, meeting_type, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(meeting_type && { meeting_type }) };
  const [data, total] = await Promise.all([
    prisma.meetingLog.findMany({ 
      where, 
      orderBy: { meeting_date: 'desc' }, 
      skip: (Number(page) - 1) * Number(limit), 
      take: Number(limit),
      include: {
        wbs: { select: { id: true, name: true, wbs_code: true } }
      }
    }),
    prisma.meetingLog.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Claims Management ───────────────────────────────────────────────────────
async function createClaim(data, userId, companyId) {
  const count = await prisma.claim.count({ where: { company_id: companyId } });
  const claim_no = `CLM-${String(count + 1).padStart(4, '0')}`;
  return prisma.claim.create({
    data: { 
        ...data, company_id: companyId, claim_no, created_by: userId, 
        claim_date: new Date(data.claim_date),
        claim_amount: Number(data.claim_amount || 0)
    }
  });
}

async function listClaims({ project_id, status, type, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(type && { type }) };
  const [data, total] = await Promise.all([
    prisma.claim.findMany({ where, orderBy: { claim_date: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { creator: { select: { id: true, name: true } } } }),
    prisma.claim.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateClaim(id, data) {
  return prisma.claim.update({ where: { id }, data: { ...data, ...(data.claim_date && { claim_date: new Date(data.claim_date) }) } });
}

async function resolveClaim(id, userId, data) {
    const claim = await prisma.claim.findUnique({ where: { id } });
    if (!claim) throw new Error('Claim not found');

    return prisma.$transaction(async (tx) => {
        const updatedClaim = await tx.claim.update({
            where: { id },
            data: { 
                status: data.status, // e.g. 'settled'
                resolution_notes: data.resolution_notes,
                settled_amount: Number(data.settled_amount || 0),
                settled_days: Number(data.settled_days || 0),
                updated_at: new Date()
            }
        });

        if (data.status === 'settled') {
            const project = await tx.project.findUnique({ where: { id: claim.project_id } });
            
            if (data.settled_amount) {
                const currentVal = Number(project.current_contract_value || project.contract_value || 0);
                await tx.project.update({
                    where: { id: claim.project_id },
                    data: { current_contract_value: currentVal + Number(data.settled_amount) }
                });
            }

            if (data.settled_days) {
                const currentForecast = project.forecast_end_date || project.end_date || new Date();
                const newForecast = new Date(currentForecast);
                newForecast.setDate(newForecast.getDate() + Number(data.settled_days));
                await tx.project.update({
                    where: { id: claim.project_id },
                    data: { forecast_end_date: newForecast }
                });
            }
        }
        return updatedClaim;
    });
}

module.exports = { createDelay, listDelays, updateDelay, createVariationOrder, listVariationOrders, approveVariationOrder, createRFI, listRFIs, updateRFI, respondToRFI, createSubmittal, listSubmittals, updateSubmittal, reviewSubmittal, createMeeting, listMeetings, createClaim, listClaims, updateClaim, resolveClaim };
