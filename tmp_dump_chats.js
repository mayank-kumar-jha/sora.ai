const fs = require('fs');
const data = JSON.parse(fs.readFileSync('.whatsapp_store.json'));
let personalChats = data.chats.filter(([id, chat]) => !id.includes('@g.us'));
console.log(`Personal chats: ${personalChats.length}`);
personalChats.slice(0, 10).forEach(([id, chat]) => {
    console.log(`ID: ${id}`);
    console.log(`Name: ${chat.name}`);
    console.log(`DisplayName: ${chat.displayName}`);
    console.log(`PushName: ${chat.pushName}`);
    console.log(`VerifiedName: ${chat.verifiedName}`);
    console.log('---');
});
