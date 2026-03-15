'use strict'; // Sync Phase 2: History Restoration

let makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers;

const loadBaileys = async () => {
    if (!makeWASocket) {
        const baileys = await import('@whiskeysockets/baileys');
        makeWASocket = baileys.default;
        DisconnectReason = baileys.DisconnectReason;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
        fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
        makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
        Browsers = baileys.Browsers;
    }
};

const qrcode = require('qrcode');
const logger = require('../config/logger');
const { notifyUser } = require('./websocketService');
const AppError = require('../utils/AppError');
const path = require('path');
const P = require('pino');
// agentService is required lazily below to break circular dependency
// (whatsappService -> agentService -> whatsappService)

const fs = require('fs');
const prisma = require('../config/database');

const AUTH_FOLDER = path.join(process.cwd(), 'data', '.baileys_auth');
const STORE_FILE = path.join(process.cwd(), 'data', 'whatsapp_store.json');

let sock = null;
let currentQrCode = null;
let isReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Custom contact and chat directory
let contactsDirectory = new Map();
let recentChats = new Map(); // chat.id -> chat object

let lastReceivedMessage = null; // Track newest message for AI context

let saveTimeout = null;
const saveStore = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            // Guard against wiping the store with empty data if sync is still in progress
            if (contactsDirectory.size === 0 && recentChats.size === 0) {
                logger.info('Skipping WhatsApp store save: Maps are empty (sync in progress?)');
                return;
            }
            const data = {
                contacts: Array.from(contactsDirectory.entries()),
                chats: Array.from(recentChats.entries())
            };
            if (!fs.existsSync(path.dirname(STORE_FILE))) fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
            fs.writeFileSync(STORE_FILE, JSON.stringify(data), 'utf-8');
            logger.info(`Saved WhatsApp store: ${data.contacts.length} contacts, ${data.chats.length} chats.`);
        } catch (err) {
            logger.error('Failed to save WhatsApp store:', err);
        }
    }, 2000);
};

const loadStore = () => {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
            if (data.contacts) contactsDirectory = new Map(data.contacts);
            if (data.chats) recentChats = new Map(data.chats);
            logger.info(`Loaded ${contactsDirectory.size} contacts and ${recentChats.size} chats from persistent store.`);
        }
    } catch (err) {
        logger.error('Failed to load WhatsApp store:', err);
    }
};


/**
 * Restore credentials from DB if filesystem is empty (for ephmeral environments like Render)
 */
const restoreCredsFromDb = async () => {
    try {
        if (!fs.existsSync(AUTH_FOLDER) || fs.readdirSync(AUTH_FOLDER).length === 0) {
            const session = await prisma.whatsAppSession.findUnique({ where: { id: 'singleton' } });
            if (session && session.creds) {
                logger.info('Restoring WhatsApp credentials from database...');
                if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
                fs.writeFileSync(path.join(AUTH_FOLDER, 'creds.json'), JSON.stringify(session.creds));
                logger.info('WhatsApp credentials restored successfully.');
                return true;
            }
        }
    } catch (err) {
        logger.error('Failed to restore credentials from DB:', err.message);
    }
    return false;
};

/**
 * Initialize WhatsApp with Baileys
 */
const initWhatsApp = async () => {
    logger.info('Initializing WhatsApp via Baileys...');

    await loadBaileys();

    // Load persistent store on startup
    loadStore();

    // Restore from DB if needed
    await restoreCredsFromDb();

    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`Baileys version: ${version.join('.')} | Latest: ${isLatest}`);

        // Temporarily re-enabling diagnostics to verify the fix
        const baileysLogFile = path.join(process.cwd(), 'logs', 'baileys.log');
        const baileysLogger = P({ level: 'info' }, P.destination(baileysLogFile));

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
            },
            logger: baileysLogger,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: true, // Permanent fix for contact discovery
            markOnlineOnConnect: false,
        });

        logger.info('WhatsApp socket created — waiting for events...');

        // Listen for contacts events
        sock.ev.on('messaging-history.set', ({ contacts, chats, isLatest }) => {
            if (contacts) {
                for (const contact of contacts) {
                    if (contact.id.includes('@newsletter')) continue;
                    const name = contact.name || contact.verifiedName || contact.notify;
                    if (name) {
                        const existing = contactsDirectory.get(contact.id);
                        if (!existing || contact.name) {
                            contactsDirectory.set(contact.id, name);
                        }
                    }
                }
            }
            if (chats) {
                for (const chat of chats) {
                    if (chat.id.includes('@newsletter')) continue;
                    recentChats.set(chat.id, chat);
                }
            }
            saveStore();
            if (contacts && contacts.length > 0) logger.info(`WhatsApp Indexing Progress: ${contactsDirectory.size} names, ${recentChats.size} chats (history.set)`);
        });

        // Listen for incoming messages
        sock.ev.on('messages.upsert', (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderJid = msg.key.remoteJid;
            const senderName = msg.pushName || contactsDirectory.get(senderJid) || senderJid;
            const textContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Media/Other]';

            logger.info(`New WhatsApp message from ${senderName}: ${textContent}`);

            // Update recentChats cache
            let existingChat = recentChats.get(senderJid) || { id: senderJid, name: senderName, unreadCount: 0 };
            existingChat.unreadCount = (existingChat.unreadCount || 0) + 1;
            recentChats.set(senderJid, existingChat);
            saveStore();

            // Track for AI reply context
            lastReceivedMessage = { from: senderName, jid: senderJid, text: textContent, timestamp: Date.now() };

            notifyUser('system', 'WHATSAPP_MESSAGE', {
                from: senderName,
                jid: senderJid,
                text: textContent
            });

            // Note: We do NOT auto-forward to AgentService here.
            // Sora only replies when the user EXPLICITLY asks her to.
            // The WHATSAPP_MESSAGE event above is enough to notify the user.
        });

        sock.ev.on('contacts.upsert', (contacts) => {
            for (const contact of contacts) {
                if (contact.id.includes('@newsletter')) continue;
                const name = contact.name || contact.verifiedName || contact.notify;
                if (name) {
                    const existing = contactsDirectory.get(contact.id);
                    if (!existing || contact.name) contactsDirectory.set(contact.id, name);
                }
            }
            saveStore();
            if (contacts && contacts.length > 0) logger.info(`WhatsApp Indexing Progress: ${contactsDirectory.size} names, ${recentChats.size} chats (contacts.upsert)`);
        });

        sock.ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (update.id.includes('@newsletter')) continue;
                const name = update.name || update.verifiedName || update.notify;
                if (name) {
                    const existing = contactsDirectory.get(update.id);
                    if (!existing || update.name) contactsDirectory.set(update.id, name);
                }
            }
            saveStore();
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            // Save to DB for persistence in ephemeral environments
            try {
                await prisma.whatsAppSession.upsert({
                    where: { id: 'singleton' },
                    update: { creds: state.creds },
                    create: { id: 'singleton', creds: state.creds }
                });
            } catch (err) {
                logger.error('Failed to save creds to DB:', err.message);
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection) logger.info(`WhatsApp Connection Update: ${connection}`);

            if (qr) {
                reconnectAttempts = 0;
                logger.info('====================================================');
                logger.info('SCAN THE QR CODE BELOW TO CONNECT WHATSAPP');
                logger.info('====================================================');

                // Print to terminal for the user (Standard format for Windows compatibility)
                try {
                    const qrcodeTerminal = require('qrcode-terminal');
                    console.log('\n'); // Add some space
                    qrcodeTerminal.generate(qr, { small: true });
                    console.log('\n'); // Add some space
                } catch (e) {
                    logger.warn('Could not print QR to terminal: ' + e.message);
                }

                try {
                    currentQrCode = await qrcode.toDataURL(qr, { margin: 2, scale: 8 });
                    notifyUser('system', 'WHATSAPP_QR', { qr: currentQrCode });
                    logger.info('QR Code also sent to Sora dashboard.');
                } catch (err) {
                    logger.error('Failed to generate QR code image', err.message);
                }
                isReady = false;
                logger.info('====================================================');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut;

                logger.warn(`WhatsApp disconnected. Code: ${statusCode} | LoggedOut: ${loggedOut}`);
                isReady = false;
                currentQrCode = null;
                sock = null;

                if (!loggedOut && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = reconnectAttempts * 3000;
                    logger.info(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`);
                    setTimeout(() => initWhatsApp(), delay);
                } else if (loggedOut) {
                    logger.info('WhatsApp logged out. Please re-scan QR code.');
                }
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp Baileys Client is Ready!');
                isReady = true;
                currentQrCode = null;
                reconnectAttempts = 0;
                notifyUser('system', 'WHATSAPP_READY', { status: 'connected' });
            }
        });

    } catch (err) {
        logger.error('Failed to initialize WhatsApp Baileys client:', err.message);
        // Try again after delay
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(() => initWhatsApp(), 5000);
        }
    }
};

const getQrCode = () => currentQrCode;
const getStatus = () => {
    // Determine sync status: true if connected but maps are empty OR very small
    // WhatsApp usually has at least a few system contacts/chats
    const isSyncing = isReady && (contactsDirectory.size < 5 || recentChats.size < 5);
    
    return { 
        isReady, 
        hasQr: !!currentQrCode,
        contactsCount: contactsDirectory.size,
        chatsCount: recentChats.size,
        syncing: isSyncing 
    };
};

const getRecentChats = async (limit = 10) => {
    if (!isReady || !sock) {
        throw new AppError('WhatsApp client is not ready. Please scan the QR code.', 503, 'WHATSAPP_NOT_READY');
    }

    try {
        const chats = Array.from(recentChats.values())
            .filter(c => !c.id.includes('@newsletter')); // Filter out newsletters
        const recent = chats.slice(0, limit);

        return recent.map(chat => ({
            name: chat.name || contactsDirectory.get(chat.id) || chat.id,
            id: chat.id,
            isGroup: chat.id?.includes('@g.us'),
            unreadCount: chat.unreadCount || 0,
        }));
    } catch (error) {
        logger.error('Error fetching WhatsApp chats:', error.message);
        throw new AppError(`WhatsApp Error: ${error.message}`, 500, 'WHATSAPP_API_ERROR');
    }
};

/**
 * Get the last received WhatsApp message for AI context
 */
const getLastReceivedMessage = () => lastReceivedMessage;

/**
 * Send a WhatsApp message
 */
const sendWhatsAppMessage = async (toNumberOrName, messageBody) => {
    if (!isReady || !sock) {
        throw new AppError('WhatsApp client is not ready. Please scan the QR code.', 503, 'WHATSAPP_NOT_READY');
    }

    try {
        let jid;
        const cleanedNumber = String(toNumberOrName).replace(/\D/g, '');

        if (cleanedNumber && cleanedNumber.length >= 10) {
            const withCountry = cleanedNumber.length === 10 ? `91${cleanedNumber}` : cleanedNumber;
            jid = `${withCountry}@s.whatsapp.net`;
        } else {
            // Search strategy: 1. Exact match, 2. Starts with, 3. Includes
            const queryName = String(toNumberOrName).toLowerCase().trim();

            // Prioritize recent individual chats (groups excluded)
            const chats = Array.from(recentChats.values())
                .filter(c => !c.id.includes('@g.us') && !c.id.includes('@newsletter'))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            const contacts = Array.from(contactsDirectory.entries())
                .filter(([id]) => !id.includes('@g.us') && !id.includes('@newsletter'))
                .map(([id, name]) => ({ id, name }));

            logger.info(`Searching for "${queryName}" in ${chats.length} recent chats and ${contacts.length} other contacts...`);

            // Pass 1: Strict Exact Match
            let match = chats.find(c => c.name && c.name.toLowerCase() === queryName);
            if (!match) {
                const found = contacts.find(c => c.name && c.name.toLowerCase() === queryName);
                if (found) match = found;
            }

            // Pass 2: Starts With
            if (!match) {
                match = chats.find(c => c.name && c.name.toLowerCase().startsWith(queryName));
            }
            if (!match) {
                const found = contacts.find(c => c.name && c.name.toLowerCase().startsWith(queryName));
                if (found) match = found;
            }

            // Pass 3: Word Boundary
            if (!match) {
                const regex = new RegExp(`\\b${queryName}\\b`, 'i');
                match = chats.find(c => c.name && regex.test(c.name));
            }
            if (!match) {
                const regex = new RegExp(`\\b${queryName}\\b`, 'i');
                const found = contacts.find(c => c.name && regex.test(c.name));
                if (found) match = found;
            }

            // Pass 4: Includes (Absolute last resort, very strict length check)
            if (!match) {
                match = chats.find(c => {
                    if (!c.name) return false;
                    const name = c.name.toLowerCase();
                    return name.includes(queryName) && (Math.abs(name.length - queryName.length) < 3);
                });
            }
            if (!match) {
                const found = contacts.find(c => {
                    if (!c.name) return false;
                    const name = c.name.toLowerCase();
                    return name.includes(queryName) && (Math.abs(name.length - queryName.length) < 3);
                });
                if (found) match = found;
            }

            if (match) {
                jid = match.id;
                logger.info(`✅ Resolved "${toNumberOrName}" to: ${match.name} (${jid})`);
            } else {
                const knownNames = chats.concat(contacts).map(c => c.name).filter(Boolean).slice(0, 10);
                logger.warn(`❌ Lookup failed for "${queryName}". Known snippets: [${knownNames.join(', ')}]`);
                throw new AppError(`Cannot find WhatsApp contact: "${toNumberOrName}". I know contacts like: ${knownNames.slice(0, 3).join(', ')}. Try "list my contacts".`, 400, 'WHATSAPP_INVALID_RECIPIENT');
            }
        }

        logger.info(`Attempting to send WhatsApp to ${jid} (${toNumberOrName})...`);
        try {
            await sock.sendMessage(jid, { text: messageBody });
            logger.info(`✅ WhatsApp message successfully queued for ${jid}`);
        } catch (sendError) {
            if (sendError.message?.includes('forbidden')) {
                throw new AppError(`Cannot send to group ${jid}. You might not have permission or the group is inaccessible on this session.`, 403, 'WHATSAPP_FORBIDDEN');
            }
            throw sendError;
        }

        return {
            to: toNumberOrName,
            jid,
            status: 'sent',
            timestamp: Date.now()
        };
    } catch (error) {
        logger.error('Error sending WhatsApp message:', error);
        if (error.code === 'WHATSAPP_INVALID_RECIPIENT') throw error;
        throw new AppError(`WhatsApp Error: ${error.message || JSON.stringify(error)}`, 500, 'WHATSAPP_API_ERROR');
    }
};

/**
 * Get contacts from the directory
 */
const getContacts = (limit = 2000) => {
    // Priority 1: Recent Chat Participants
    const recent = Array.from(recentChats.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .map(c => ({ id: c.id, name: c.name || c.id }))
        .filter(c => !c.id.includes('@newsletter') && !c.id.includes('@g.us'));

    // Priority 2: Full Phonebook
    const phonebook = Array.from(contactsDirectory.entries())
        .filter(([id]) => !id.includes('@newsletter') && !id.includes('@g.us')) // Don't filter out recentChats here, UI can handle duplicates or we can dedupe
        .map(([id, name]) => ({ id, name }));

    // Deduplicate while preserving order (recent first)
    const seen = new Set();
    const combined = [];

    for (const c of recent) {
        if (!seen.has(c.id)) {
            combined.push(c);
            seen.add(c.id);
        }
    }

    for (const c of phonebook) {
        if (!seen.has(c.id)) {
            combined.push(c);
            seen.add(c.id);
        }
    }

    return combined.slice(0, limit);
};

/**
 * Clear the local cache
 */
const clearCache = () => {
    contactsDirectory.clear();
    recentChats.clear();
    try {
        if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
    } catch (e) { }
    // Persistent store logic restored
    return {
        status: 'success',
        message: 'WhatsApp memory and disk cache cleared. Sora will now re-sync everything from scratch. This ensures accurate names.'
    };
};

/**
 * Wait for WhatsApp to be ready (useful for background workers)
 */
const waitUntilReady = async (timeoutMs = 30000) => {
    if (isReady) return true;
    
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (isReady) {
                clearInterval(interval);
                resolve(true);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                reject(new AppError('WhatsApp failed to become ready in time', 503, 'WHATSAPP_TIMEOUT'));
            }
        }, 1000);
    });
};

const requestPairingCode = async (phoneNumber) => {
    if (isReady || !sock) {
        throw new AppError('WhatsApp client is already connected or not initialized.', 400, 'WHATSAPP_STATE_ERROR');
    }

    try {
        const code = await sock.requestPairingCode(phoneNumber);
        logger.info(`✅ Generated WhatsApp Pairing Code for ${phoneNumber}: ${code}`);
        return code;
    } catch (err) {
        logger.error('Failed to request pairing code:', err.message);
        throw new AppError(`Failed to generate pairing code: ${err.message}`, 500, 'WHATSAPP_PAIRING_ERROR');
    }
};

/**
 * Hard reset the WhatsApp session
 */
const resetSession = async () => {
    logger.warn('🚀 WHATSAPP SESSION HARD RESET INITIATED');
    
    // 1. Close current connection if any
    if (sock) {
        try {
            sock.end();
            sock.logout();
        } catch (e) {
            logger.warn('Error closing socket during reset: ' + e.message);
        }
    }
    
    // 2. Clear in-memory state
    sock = null;
    isReady = false;
    currentQrCode = null;
    reconnectAttempts = 0;
    contactsDirectory.clear();
    recentChats.clear();
    
    // 3. Delete auth folder and store file
    try {
        if (fs.existsSync(AUTH_FOLDER)) {
            // fs.rmSync is cleaner for directories
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            logger.info(`Deleted auth folder: ${AUTH_FOLDER}`);
        }
        if (fs.existsSync(STORE_FILE)) {
            fs.unlinkSync(STORE_FILE);
            logger.info(`Deleted store file: ${STORE_FILE}`);
        }
    } catch (err) {
        logger.error('Failed to delete session files:', err);
        throw new AppError('Failed to delete session files', 500, 'WHATSAPP_RESET_ERROR');
    }
    
    logger.info('✅ WhatsApp session has been wiped clean.');
    return { status: 'success', message: 'Session reset successfully' };
};

module.exports = {
    initWhatsApp,
    getQrCode,
    getStatus,
    getRecentChats,
    getContacts,
    clearCache,
    getLastReceivedMessage,
    sendWhatsAppMessage,
    waitUntilReady,
    requestPairingCode,
    resetSession
};
