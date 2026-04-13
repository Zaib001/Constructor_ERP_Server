require('dotenv').config();
const projectAccessService = require('../src/modules/projectAccess/projectAccess.service');

async function verify() {
    const superadminId = '0107f2e5-f40e-4bbf-bb7c-92519f9bd396';
    console.log(`Verifying projects for Superadmin (${superadminId})...`);
    
    try {
        const result = await projectAccessService.getUserProjects(superadminId);
        console.log('User:', result.user.name);
        console.log('Projects count:', result.projects.length);
        result.projects.forEach(p => {
            console.log(` - [${p.project_id}] ${p.name} (Access: ${p.access_type})`);
        });
        
        if (result.projects.length > 0) {
            console.log('\nSUCCESS: Superadmin can now see projects!');
        } else {
            console.log('\nFAILURE: Superadmin still sees no projects.');
        }
    } catch (err) {
        console.error('Verification failed:', err);
    }
    
    process.exit(0);
}

verify();
