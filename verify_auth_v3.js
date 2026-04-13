const axios = require('axios');
require('dotenv').config();

const API_URL = `http://localhost:${process.env.PORT || 5001}/api`;

async function verifyAuth() {
    const testUsers = [
        { email: 'hoopoe@hoopoe.com', password: 'Test1234!', label: 'Project Manager' },
        { email: 'TEST_employee@hoopoe.com', password: 'Test1234!', label: 'Employee' }
    ];

    console.log(`Starting Verification on ${API_URL}...\n`);

    for (const user of testUsers) {
        console.log(`--- Testing ${user.label}: ${user.email} ---`);
        try {
            // 1. Login
            const loginRes = await axios.post(`${API_URL}/auth/login`, {
                email: user.email,
                password: user.password
            });

            const { token, user: userData } = loginRes.data;
            console.log('✅ Login Successful');
            console.log(`   User ID: ${userData.id}`);
            console.log(`   Role: ${userData.roleCode}`);
            console.log(`   Company: ${userData.companyName} (${userData.companyId})`);

            const config = { headers: { Authorization: `Bearer ${token}` } };

            // 2. Verify Session (via /sessions/my or /auth/me)
            const meRes = await axios.get(`${API_URL}/auth/me`, config);
            if (meRes.status === 200) {
                console.log('✅ Session Verified (/auth/me)');
            }

            // 3. Verify Dashboard APIs (The common 401 triggers)
            console.log('Testing Dashboard APIs...');
            
            const inboxRes = await axios.get(`${API_URL}/approvals/inbox`, config);
            console.log(`   /approvals/inbox: ${inboxRes.status} (Total: ${inboxRes.data.total || 0})`);

            const sessRes = await axios.get(`${API_URL}/sessions/my`, config);
            console.log(`   /sessions/my: ${sessRes.status} (Count: ${sessRes.data.length || 0})`);

            const projRes = await axios.get(`${API_URL}/project-access/user/${userData.id}`, config);
            console.log(`   /project-access: ${projRes.status}`);

            console.log(`✅ ${user.label} Auth Flow Verified Cleanly.\n`);

        } catch (err) {
            console.error(`❌ FAILED for ${user.email}:`, err.response?.data || err.message);
            if (err.response?.status === 401) {
                console.error('   !!! 401 Detected - This would trigger a login loop !!!');
            }
        }
    }
}

// Note: Ensure the server is running before executing this.
verifyAuth();
