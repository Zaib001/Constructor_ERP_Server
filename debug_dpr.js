require('dotenv').config();
const axios = require('axios');
const prisma = require('./src/db');

async function debugCreateDPR() {
    try {
        const neom = await prisma.project.findFirst({ where: { code: 'PRJ-NEOM-9' } });
        const wbs = await prisma.wBS.findFirst({ where: { project_id: neom.id } });

        const login = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'engineer@erp.com',
            password: 'Password123!'
        });
        const token = login.data.data.token;

        const payload = {
            project_id: neom.id,
            report_date: new Date().toISOString().split('T')[0],
            weather: 'Clear',
            shift: 'day',
            executive_summary: 'Debugging error',
            items: [{
                wbs_id: wbs.id,
                description: 'Test Activity',
                planned_today_qty: 10,
                actual_today_qty: 5
            }],
            labor_logs: [],
            equipment_logs: [],
            material_issue_ids: [],
            link_resource_ids: []
        };

        const res = await axios.post('http://localhost:5000/api/execution/dpr', payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Success:", res.data);
    } catch (e) {
        console.error("Error Status:", e.response ? e.response.status : 'No response');
        console.error("Error Detail:", e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
    } finally {
        await prisma.$disconnect();
    }
}
debugCreateDPR();
