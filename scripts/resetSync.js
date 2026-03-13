const fs = require('fs');
const path = require('path');

const credsFile = 'data/.baileys_auth/creds.json';
if (fs.existsSync(credsFile)) {
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
    creds.processedHistoryMessages = [];
    creds.lastAccountSyncTimestamp = 0;
    fs.writeFileSync(credsFile, JSON.stringify(creds, null, 2));
    console.log('Successfully reset WhatsApp sync metadata in creds.json');
} else {
    console.error('creds.json not found');
}

const storeFile = 'data/whatsapp_store.json';
if (fs.existsSync(storeFile)) {
    fs.unlinkSync(storeFile);
    console.log('Removed stale whatsapp_store.json');
}
