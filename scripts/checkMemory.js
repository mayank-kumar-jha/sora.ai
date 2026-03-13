const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(process.cwd(), 'data', 'whatsapp_store.json');
if (fs.existsSync(STORE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    console.log(`Contacts in store: ${data.contacts?.length || 0}`);
    console.log(`Chats in store: ${data.chats?.length || 0}`);

    const anushka = data.contacts?.find(([id, name]) => name && name.toLowerCase().includes('anushka'));
    if (anushka) {
        console.log(`Found Anushka: ${anushka[0]} - ${anushka[1]}`);
    } else {
        console.log('Anushka NOT found in contactsDirectory');
    }

    const harshu = data.contacts?.find(([id, name]) => name && name.toLowerCase().includes('harshu'));
    if (harshu) {
        console.log(`Found Harshu: ${harshu[0]} - ${harshu[1]}`);
    } else {
        console.log('Harshu NOT found in contactsDirectory');
    }
} else {
    console.log('Store file not found');
}
