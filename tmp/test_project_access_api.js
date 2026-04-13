require('dotenv').config();

async function testApi() {
    const baseUrl = 'http://localhost:5000/api';
    
    console.log('--- TESTING PROJECT ACCESS API ---');

    // To test this we need a token.
    // Since I can't easily get a user's password, I'll bypass the API and call the service functions directly
    // but in a way that simulates the request context if needed.
    
    const projectAccessService = require('../src/modules/projectAccess/projectAccess.service');
    
    try {
        console.log('Calling projectAccessService.getAllProjects()...');
        const projects = await projectAccessService.getAllProjects();
        console.log('Projects returned:', JSON.stringify(projects, null, 2));

        console.log('\nCalling projectAccessService.getAllAssignments()...');
        const assignments = await projectAccessService.getAllAssignments();
        console.log('Assignments returned:', JSON.stringify(assignments, null, 2));
        
    } catch (err) {
        console.error('Service call failed:', err);
    }

    process.exit(0);
}

testApi();
