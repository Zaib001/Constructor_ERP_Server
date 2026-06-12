"use strict";

const prisma = require("../../../db");
const { approveStep, rejectStep } = require("../../approvals/approvals.service");

/**
 * Get pending Vendor and RFQ (Vendor Selection) approvals for the user.
 * 
 * @param {object} userCtx - Requesting user's session context
 * @param {string|null} type - "vendor" or "rfq" to filter, or null/undefined for both
 */
async function getPendingApprovals(userCtx, type) {
    const user = await prisma.user.findFirst({
        where: { id: userCtx.id, is_active: true },
        select: {
            role_id: true,
            company_id: true,
            roles: { select: { code: true } }
        }
    });
    if (!user) {
        throw new Error("Authenticated user record not found.");
    }

    const docTypes = [];
    if (!type || type === "vendor") docTypes.push("VENDOR");
    if (!type || type === "rfq") docTypes.push("VENDOR_SELECTION");

    // Fetch steps matching user's pending inbox for VENDOR and VENDOR_SELECTION
    const steps = await prisma.approvalStep.findMany({
        where: {
            status: "pending",
            OR: [
                { approver_user: userCtx.id },
                { AND: [{ approver_user: null }, { role_id: user.role_id }] }
            ],
            approval_requests: {
                is: {
                    current_status: "in_progress",
                    doc_type: { in: docTypes },
                    company_id: user.company_id || undefined
                }
            }
        },
        include: {
            approval_requests: {
                include: {
                    requestedByRel: { select: { name: true, email: true } },
                    project: { select: { name: true, code: true } }
                }
            }
        },
        orderBy: { approval_requests: { created_at: "asc" } }
    });

    // Resolve detailed info for each pending approval
    const result = [];
    for (const step of steps) {
        const req = step.approval_requests;
        if (!req) continue;

        let details = null;
        if (req.doc_type === "VENDOR") {
            details = await prisma.vendor.findUnique({
                where: { id: req.doc_id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    contact_person: true,
                    address: true,
                    tax_id: true,
                    services: true,
                    category: true,
                    rating: true,
                    bank_details: true,
                    attachments: true,
                    status: true
                }
            });
        } else if (req.doc_type === "VENDOR_SELECTION") {
            const comparison = await prisma.comparisonEngine.findUnique({
                where: { id: req.doc_id },
                include: {
                    rfq: {
                        select: {
                            rfq_no: true,
                            quote_deadline: true,
                            notes: true,
                            status: true
                        }
                    },
                    selected_vendor: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true
                        }
                    }
                }
            });

            if (comparison) {
                // Fetch the quote details
                const selectedQuote = await prisma.vendorQuote.findFirst({
                    where: { rfq_id: comparison.rfq_id, vendor_id: comparison.selected_vendor_id },
                    include: { items: { include: { item: { select: { name: true, unit: true } } } } }
                });

                details = {
                    comparisonId: comparison.id,
                    rfqId: comparison.rfq_id,
                    rfqNo: comparison.rfq.rfq_no,
                    selectionReason: comparison.selection_reason,
                    comparisonSnapshot: comparison.comparison_snapshot,
                    selectedVendor: comparison.selected_vendor,
                    amount: req.amount,
                    quoteItems: selectedQuote ? selectedQuote.items : []
                };
            }
        }

        result.push({
            stepId: step.id,
            approvalRequestId: req.id,
            docType: req.doc_type,
            docId: req.doc_id,
            amount: req.amount,
            requestedBy: req.requested_by,
            requestedByName: req.requestedByRel?.name || "Unknown",
            projectName: req.project?.name || "Global",
            projectCode: req.project?.code || null,
            stepOrder: step.step_order,
            totalSteps: req.total_steps,
            currentStep: req.current_step,
            createdAt: req.created_at,
            details: details
        });
    }

    return result;
}

/**
 * Approve or Reject a Vendor approval step.
 */
async function actionVendorApproval(vendorId, action, remarks, userCtx, ipAddress, deviceInfo) {
    const request = await prisma.approvalRequest.findFirst({
        where: {
            doc_type: "VENDOR",
            doc_id: vendorId,
            current_status: "in_progress"
        }
    });

    if (!request) {
        throw new Error("No active approval request found for this vendor.");
    }

    if (action === "approve") {
        return await approveStep(request.id, userCtx, remarks, ipAddress, deviceInfo);
    } else if (action === "reject") {
        return await rejectStep(request.id, userCtx, remarks, ipAddress, deviceInfo);
    } else {
        throw new Error("Invalid action. Supported actions: approve, reject");
    }
}

/**
 * Approve or Reject an RFQ selection.
 */
async function actionRfqApproval(id, action, remarks, userCtx, ipAddress, deviceInfo) {
    // Determine if the id is the RFQ ID or comparison ID
    let comparisonId = id;
    const isRfq = await prisma.rFQ.findUnique({ where: { id } });
    
    if (isRfq) {
        // If it's an RFQ ID, find the comparison record
        const comparison = await prisma.comparisonEngine.findFirst({
            where: { rfq_id: id },
            orderBy: { created_at: "desc" }
        });
        if (!comparison) {
            throw new Error("No quotation comparison found for this RFQ.");
        }
        comparisonId = comparison.id;
    }

    const request = await prisma.approvalRequest.findFirst({
        where: {
            doc_type: "VENDOR_SELECTION",
            doc_id: comparisonId,
            current_status: "in_progress"
        }
    });

    if (!request) {
        throw new Error("No active approval request found for this RFQ comparison.");
    }

    if (action === "approve") {
        return await approveStep(request.id, userCtx, remarks, ipAddress, deviceInfo);
    } else if (action === "reject") {
        return await rejectStep(request.id, userCtx, remarks, ipAddress, deviceInfo);
    } else {
        throw new Error("Invalid action. Supported actions: approve, reject");
    }
}

module.exports = {
    getPendingApprovals,
    actionVendorApproval,
    actionRfqApproval
};
