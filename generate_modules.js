const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const files = {
    'modules/purchaseRequisitions/purchaseRequisitions.routes.js': `"use strict";
const express = require("express");
const router = express.Router();
const controller = require("./purchaseRequisitions.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

router.use(authenticateJWT);

router.get("/", controller.getAllPRs);
router.post("/", controller.createPR);
router.get("/:id", controller.getPRById);
router.post("/:id/approve", controller.approvePR);

module.exports = router;
`,

    'modules/purchaseRequisitions/purchaseRequisitions.controller.js': `"use strict";
const service = require("./purchaseRequisitions.service");
const logger = require("../../logger");

async function getAllPRs(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllPRs(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllPRs error", error);
        next(error);
    }
}

async function getPRById(req, res, next) {
    try {
        const result = await service.getPRById(req.params.id, req.user);
        if (!result) return res.status(404).json({ success: false, message: "PR not found" });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getPRById error", error);
        next(error);
    }
}

async function createPR(req, res, next) {
    try {
        const result = await service.createPR(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("createPR error", error);
        next(error);
    }
}

async function approvePR(req, res, next) {
    try {
        const result = await service.approvePR(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("approvePR error", error);
        next(error);
    }
}

module.exports = { getAllPRs, getPRById, createPR, approvePR };
`,

    'modules/purchaseRequisitions/purchaseRequisitions.service.js': `"use strict";
const prisma = require("../../db");
const { requestApproval } = require("../approvals/approvals.service");
const { registerAdapter } = require("../approvals/approvals.adapter");

registerAdapter("PR", async ({ docId, status }) => {
    let finalStatus = "draft";
    if (status === "approved") finalStatus = "approved_for_rfq";
    if (status === "rejected") finalStatus = "rejected";

    await prisma.purchaseRequisition.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllPRs(user, page, pageSize) {
    const where = { deleted_at: null };
    if (!user.isSuperAdmin) where.company_id = user.companyId;

    return prisma.purchaseRequisition.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { company: true, project: true, requester: true, items: { include: { item: true } } },
        orderBy: { created_at: 'desc' }
    });
}

async function getPRById(id, user) {
    const where = { id, deleted_at: null };
    if (!user.isSuperAdmin) where.company_id = user.companyId;

    return prisma.purchaseRequisition.findFirst({
        where,
        include: { company: true, project: true, requester: true, items: { include: { item: true } } }
    });
}

async function createPR(data, user) {
    if (!data.project_id || !data.wbs_id || !data.items || !data.items.length) {
        throw new Error("Missing required PR fields (project, wbs, items)");
    }
    const pr = await prisma.purchaseRequisition.create({
        data: {
            pr_no: data.pr_no || \`PR-\${Date.now()}\`,
            company_id: user.isSuperAdmin ? data.company_id : user.companyId,
            project_id: data.project_id,
            wbs_id: data.wbs_id,
            reason: data.reason,
            requested_by: user.id,
            status: "submitted",
            items: {
                create: data.items.map(item => ({
                    item_id: item.item_id,
                    quantity: item.quantity,
                    remarks: item.remarks
                }))
            }
        },
        include: { items: true }
    });

    await requestApproval({
        docType: "PR",
        docId: pr.id,
        projectId: pr.project_id,
        amount: 0,
        remarks: pr.reason,
        items: []
    }, user.id);

    return pr;
}

async function approvePR(id, data, user) {
    const pr = await prisma.purchaseRequisition.update({
        where: { id },
        data: { status: 'approved_for_rfq' }
    });
    return pr;
}

module.exports = { getAllPRs, getPRById, createPR, approvePR };
`,

    'modules/rfqs/rfqs.routes.js': `"use strict";
const express = require("express");
const router = express.Router();
const controller = require("./rfqs.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

router.use(authenticateJWT);

router.get("/", controller.getAllRFQs);
router.post("/", controller.createRFQ);
router.get("/:id", controller.getRFQById);
router.post("/:id/vendors", controller.addVendors);
router.post("/:id/quotes", controller.submitQuote);
router.post("/:id/compare", controller.compareQuotes);

module.exports = router;
`,

    'modules/rfqs/rfqs.controller.js': `"use strict";
const service = require("./rfqs.service");
const logger = require("../../logger");

async function getAllRFQs(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllRFQs(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllRFQs error", error);
        next(error);
    }
}

async function getRFQById(req, res, next) {
    try {
        const result = await service.getRFQById(req.params.id, req.user);
        if (!result) return res.status(404).json({ success: false, message: "RFQ not found" });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getRFQById error", error);
        next(error);
    }
}

async function createRFQ(req, res, next) {
    try {
        const result = await service.createRFQ(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("createRFQ error", error);
        next(error);
    }
}

async function addVendors(req, res, next) {
    try {
        const result = await service.addVendors(req.params.id, req.body.vendorIds);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("addVendors error", error);
        next(error);
    }
}

async function submitQuote(req, res, next) {
    try {
        const result = await service.submitQuote(req.params.id, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("submitQuote error", error);
        next(error);
    }
}

async function compareQuotes(req, res, next) {
    try {
        const result = await service.compareQuotes(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("compareQuotes error", error);
        next(error);
    }
}

module.exports = { getAllRFQs, getRFQById, createRFQ, addVendors, submitQuote, compareQuotes };
`,

    'modules/rfqs/rfqs.service.js': `"use strict";
const prisma = require("../../db");

async function getAllRFQs(user, page, pageSize) {
    const where = { deleted_at: null };
    // RLS emulation if applicable (though RFQ doesn't have company_id directly, it links via requisition)
    return prisma.rFQ.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: { vendors: { include: { vendor: true } } },
        orderBy: { created_at: 'desc' }
    });
}

async function getRFQById(id, user) {
    return prisma.rFQ.findFirst({
        where: { id, deleted_at: null },
        include: {
            requisition: true,
            vendors: { include: { vendor: true } },
            quotes: { include: { vendor: true, items: true } }
        }
    });
}

async function createRFQ(data, user) {
    if (!data.requisition_id) throw new Error("Requisition ID is required");
    const pr = await prisma.purchaseRequisition.findUnique({where: {id: data.requisition_id}});
    if(pr.status !== 'approved_for_rfq') throw new Error("PR is not approved for RFQ");

    return prisma.rFQ.create({
        data: {
            rfq_no: data.rfq_no || \`RFQ-\${Date.now()}\`,
            requisition_id: data.requisition_id,
            created_by: user.id,
            notes: data.notes,
            status: "issued"
        }
    });
}

async function addVendors(rfqId, vendorIds) {
    if(!vendorIds || vendorIds.length === 0) throw new Error("At least one vendor required");
    return prisma.$transaction(vendorIds.map(vId => 
        prisma.rFQVendor.create({
            data: { rfq_id: rfqId, vendor_id: vId }
        })
    ));
}

async function submitQuote(rfqId, data) {
    return prisma.vendorQuote.create({
        data: {
            rfq_id: rfqId,
            vendor_id: data.vendor_id,
            delivery_days: data.delivery_days,
            notes: data.notes,
            status: "submitted",
            items: {
                create: data.items.map(i => ({
                    item_id: i.item_id,
                    unit_price: i.unit_price,
                    quantity: i.quantity,
                    total_price: Number(i.unit_price) * Number(i.quantity)
                }))
            }
        }
    });
}

async function compareQuotes(rfqId, data, user) {
    const comparison = await prisma.comparisonEngine.create({
        data: {
            rfq_id: rfqId,
            selected_vendor_id: data.selected_vendor_id,
            selection_reason: data.selection_reason,
            compared_by: user.id,
            comparison_snapshot: data.snapshot || {}
        }
    });
    
    await prisma.rFQ.update({
        where: { id: rfqId },
        data: { status: "vendor_selected" }
    });

    return comparison;
}

module.exports = { getAllRFQs, getRFQById, createRFQ, addVendors, submitQuote, compareQuotes };
`,

    'modules/pettyCash/pettyCash.routes.js': `"use strict";
const express = require("express");
const router = express.Router();
const controller = require("./pettyCash.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

router.use(authenticateJWT);

router.get("/requests", controller.getAllRequests);
router.post("/requests", controller.createRequest);
router.get("/requests/:id", controller.getRequestById);
router.post("/expenses", controller.submitExpense);
router.get("/expenses", controller.getAllExpenses);

module.exports = router;
`,

    'modules/pettyCash/pettyCash.controller.js': `"use strict";
const service = require("./pettyCash.service");
const logger = require("../../logger");

async function getAllRequests(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllRequests(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllRequests error", error);
        next(error);
    }
}

async function getRequestById(req, res, next) {
    try {
        const result = await service.getRequestById(req.params.id, req.user);
        if (!result) return res.status(404).json({ success: false, message: "Request not found" });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getRequestById error", error);
        next(error);
    }
}

async function createRequest(req, res, next) {
    try {
        const result = await service.createRequest(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("createRequest error", error);
        next(error);
    }
}

async function submitExpense(req, res, next) {
    try {
        const result = await service.submitExpense(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("submitExpense error", error);
        next(error);
    }
}

async function getAllExpenses(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const result = await service.getAllExpenses(req.user, parseInt(page) || 1, parseInt(pageSize) || 50);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error("getAllExpenses error", error);
        next(error);
    }
}

module.exports = { getAllRequests, getRequestById, createRequest, submitExpense, getAllExpenses };
`,

    'modules/pettyCash/pettyCash.service.js': `"use strict";
const prisma = require("../../db");
const { requestApproval } = require("../approvals/approvals.service");
const { registerAdapter } = require("../approvals/approvals.adapter");

registerAdapter("PETTY_CASH", async ({ docId, status }) => {
    let finalStatus = "submitted";
    if (status === "approved") finalStatus = "approved";
    if (status === "rejected") finalStatus = "rejected";

    await prisma.pettyCashRequest.update({
        where: { id: docId },
        data: { status: finalStatus, updated_at: new Date() }
    });
});

async function getAllRequests(user, page, pageSize) {
    const where = { deleted_at: null };
    if (!user.isSuperAdmin) where.company_id = user.companyId;

    return prisma.pettyCashRequest.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: { company: true, project: true, requester: true },
        orderBy: { created_at: 'desc' }
    });
}

async function getRequestById(id, user) {
    const where = { id, deleted_at: null };
    if (!user.isSuperAdmin) where.company_id = user.companyId;

    return prisma.pettyCashRequest.findFirst({
        where,
        include: { company: true, project: true, requester: true, expenses: true }
    });
}

async function createRequest(data, user) {
    const request = await prisma.pettyCashRequest.create({
        data: {
            request_no: data.request_no || \`PC-\${Date.now()}\`,
            company_id: user.isSuperAdmin ? data.company_id : user.companyId,
            project_id: data.project_id,
            wbs_id: data.wbs_id,
            description: data.description,
            estimated_cost: data.estimated_cost,
            emergency_reason: data.emergency_reason,
            requested_by: user.id,
            status: "pending_pm_approval"
        }
    });

    await requestApproval({
        docType: "PETTY_CASH",
        docId: request.id,
        projectId: request.project_id,
        amount: request.estimated_cost,
        remarks: request.emergency_reason,
        items: []
    }, user.id);

    return request;
}

async function submitExpense(data, user) {
    // VAT math validated: totalAmount = excludingVatAmount + vatAmount
    const excluding = Number(data.excluding_vat_amount) || 0;
    const vat = Number(data.vat_amount) || 0;
    const total = Number(data.total_amount) || 0;
    
    if (Math.abs((excluding + vat) - total) > 0.01) {
        throw new Error("VAT math validation failed: totalAmount must equal excludingVatAmount + vatAmount");
    }

    const pr = await prisma.pettyCashRequest.findUnique({where:{id: data.request_id}});
    if (pr.status !== 'approved') {
        throw new Error("Petty cash expense cannot be submitted without approved request");
    }

    return prisma.pettyCashExpense.create({
        data: {
            request_id: data.request_id,
            bill_number: data.bill_number,
            company_name: data.company_name,
            vat_number: data.vat_number,
            excluding_vat_amount: excluding,
            vat_amount: vat,
            total_amount: total,
            attachment: data.attachment
        }
    });
}

async function getAllExpenses(user, page, pageSize) {
    const where = {};
    if (!user.isSuperAdmin) {
        where.request = { company_id: user.companyId };
    }
    return prisma.pettyCashExpense.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: { request: true },
        orderBy: { created_at: 'desc' }
    });
}

module.exports = { getAllRequests, getRequestById, createRequest, submitExpense, getAllExpenses };
`
};

for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(srcDir, relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
}

// Modify app.js
let appJsPath = path.join(srcDir, 'app.js');
let appJsCode = fs.readFileSync(appJsPath, 'utf8');

if(!appJsCode.includes('purchaseRequisitionsRoutes')) {
    appJsCode = appJsCode.replace(
        'const projectsRoutes = require("./modules/projects/projects.routes");',
        \`const projectsRoutes = require("./modules/projects/projects.routes");
const purchaseRequisitionsRoutes = require("./modules/purchaseRequisitions/purchaseRequisitions.routes");
const rfqsRoutes = require("./modules/rfqs/rfqs.routes");
const pettyCashRoutes = require("./modules/pettyCash/pettyCash.routes");\`
    );
    appJsCode = appJsCode.replace(
        'app.use("/api/projects", projectsRoutes);',
        \`app.use("/api/projects", projectsRoutes);
app.use("/api/purchase-requisitions", purchaseRequisitionsRoutes);
app.use("/api/rfqs", rfqsRoutes);
app.use("/api/petty-cash", pettyCashRoutes);\`
    );
    fs.writeFileSync(appJsPath, appJsCode);
    console.log("Patched app.js successfully");
} else {
    console.log("app.js already patched");
}
