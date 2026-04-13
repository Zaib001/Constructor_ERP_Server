require('dotenv').config();
const prisma = require('../../db');

async function testFix() {
  console.log('Testing Approval Inbox fix...');
  
  const userId = "5ae0af56-342b-4f59-a6c5-9e34137bd289";
  const departmentId = "e175479a-91ff-400f-a173-00db60987296";
  const companyId = "b7325d70-99c3-4440-aa3f-aa777c6753ee";

  try {
    const steps = await prisma.approvalStep.findMany({
      where: {
        status: "pending",
        approver_user: userId,
        approval_requests: {
          is: { 
            current_status: "in_progress",
            deleted_at: null,
            company_id: companyId,
            department_id: departmentId
          }
        }
      },
      include: {
        approval_requests: true
      },
      take: 1
    });

    console.log('Query successful! Found steps:', steps.length);
  } catch (error) {
    console.error('Query failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testFix();
