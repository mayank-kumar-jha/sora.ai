'use strict';

const { queues } = require('../src/queues');
const logger = require('../src/config/logger');

async function checkStatus() {
    console.log('\n--- SORA QUEUE STATUS ---\n');
    
    for (const [name, queue] of Object.entries(queues)) {
        try {
            const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
            console.log(`${name.toUpperCase()} QUEUE:`);
            console.log(`  Waiting:   ${counts.waiting}`);
            console.log(`  Active:    ${counts.active}`);
            console.log(`  Completed: ${counts.completed}`);
            console.log(`  Failed:    ${counts.failed}`);
            console.log(`  Delayed:   ${counts.delayed}`);
            console.log('------------------------');
        } catch (err) {
            console.error(`Failed to get status for ${name}:`, err.message);
        }
    }
    
    // Check for any failed jobs in the last 10
    console.log('\nRECENT FAILED JOBS (Last 5):');
    for (const [name, queue] of Object.entries(queues)) {
        const failed = await queue.getFailed(0, 5);
        if (failed.length > 0) {
            console.log(`\n[${name.toUpperCase()}]`);
            failed.forEach(job => {
                console.log(` - Job ID: ${job.id}`);
                console.log(`   Error:  ${job.failedReason}`);
            });
        }
    }

    process.exit(0);
}

checkStatus();
