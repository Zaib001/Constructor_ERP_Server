require('dotenv').config();
const axios = require('axios');

async function testSubmitDPR() {
    try {
        // Needs an admin token or login
        const login = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'engineer@erp.com',
            password: 'Password123!'
        });
        const token = login.data.token;
        console.log("Logged in!");

        const dprPayload = {
            project_id: '121bfe84-a1cd-40a2-afbd-b6bf90cd9def', // Needs valid project UUID
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
    }
}
testSubmitDPR();
