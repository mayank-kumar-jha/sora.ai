
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('--- RECENT TASKS ---');
    console.log(JSON.stringify(tasks, null, 2));

    const logs = await prisma.executionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('\n--- RECENT EXECUTION LOGS ---');
    console.log(JSON.stringify(logs, null, 2));
    
    const conversations = await prisma.conversation.findMany({
      orderBy: { timestamp: 'desc' },
      take: 5
    });
    console.log('\n--- RECENT CONVERSATIONS ---');
    console.log(JSON.stringify(conversations, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
