const fs = require('fs');
const data = JSON.parse(fs.readFileSync('.whatsapp_store.json'));
console.log(`Contacts fetched: ${data.contacts.length}`);
data.contacts.forEach(([id, name]) => {
    console.log(name);
});
