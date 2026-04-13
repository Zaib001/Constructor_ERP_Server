require('dotenv').config();
const prisma = require('./src/db');
const axios = require('axios');

async function testSubmitDPR() {
    try {
        const neom = await prisma.project.findFirst({ where: { code: 'PRJ-NEOM-9' } });
        
        const login = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'engineer@erp.com',
            password: 'Password123!'
        });
        const token = login.data.data.token;
        console.log("Logged in!");

        const dprPayload = {
            project_id: neom.id,
            report_date: new Date().toISOString().split('T')[0],
            weather: 'Clear',
            shift: 'day',
            executive_summary: 'Test summary',
            safety_note: 'No incidents',
            remarks: 'Smooth operations',
            items: [],
            labor_logs: [{ trade: 'Mason', headcount: 5, hours_worked: 8 }],
            equipment_logs: [{ equipment_no: 'EX-01', hours_used: 6, idle_hours: 2 }],
            material_issue_ids: []
        };

        const res = await axios.post('http://localhost:5000/api/execution/dpr', dprPayload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("DPR Success:", res.data);
    } catch (e) {
        console.error("DPR Error:", e.response ? e.response.data : e.message);
    } finally {
        await prisma.$disconnect();
    }
}
testSubmitDPR();
