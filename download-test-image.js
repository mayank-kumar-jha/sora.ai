const fs = require('fs');
fetch('https://http.cat/302')
    .then(res => res.arrayBuffer())
    .then(buf => {
        fs.writeFileSync('whatsapp-qr.png', Buffer.from(buf));
        console.log('✅ Successfully downloaded placeholder image (cat).');
    })
    .catch(err => console.error('Error downloading:', err));
