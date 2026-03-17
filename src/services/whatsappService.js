'use strict';

const qrcode = require('qrcode');
const logger = require('../config/logger');
const { notifyUser } = require('./websocketService');
const AppError = require('../utils/AppError');
const path = require('path');
const P = require('pino');
const fs = require('fs');
const prisma = require('../config/database');

// Baileys imports (lazy loaded)
let makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, BufferJSON;

const loadBaileys = async () => {
    if (!makeWASocket) {
        const baileys = await import('@whiskeysockets/baileys');
        makeWASocket = baileys.default;
        DisconnectReason = baileys.DisconnectReason;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
        fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
        makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
        Browsers = baileys.Browsers;
        BufferJSON = baileys.BufferJSON;
    }
};

/**
 * Extremely robust Buffer revival for Baileys data types.
 * Handles Buffer {type:'Buffer', data:...}, Uint8Arrays, and raw base64 strings for known keys.
 */
const universalRevive = (data) => {
    if (!data || typeof data !== 'object') {
        // Handle raw string case if it looks like base64 and might be a key
        return data; 
    }
    
    // 1. Standard Buffer serialization
    if (data.type === 'Buffer') {
        if (Array.isArray(data.data)) return Buffer.from(data.data);
        if (typeof data.data === 'string') return Buffer.from(data.data, 'base64');
    }
    
    // 2. Handle Uint8Array
    if (data instanceof Uint8Array) return Buffer.from(data);
    
    // 3. Handle Arrays recursively
    if (Array.isArray(data)) return data.map(universalRevive);
    
    // 4. Handle Objects recursively
    const revived = {};
    for (const [key, value] of Object.entries(data)) {
        // Fields that Baileys ABSOLUTELY expects to be Buffers in authentication state
        const bufferKeys = [
            'noiseKey', 'signedPreKey', 'identityKey', 'advSecretKey', 
            'private', 'public', 'iv', 'key', 'encKey', 'macKey',
            'tag', 'ciphertext', 'mediaKey', 'fileSha256', 'fileEncSha256',
            'clientPayload', 'serverPublicKey', 'ephemeralKeyPair'
        ];
        
        // If it's a known key and it's a base64 string, force revive it
        if (bufferKeys.includes(key) && typeof value === 'string' && value.length > 10) {
            try {
                // Only revive if it looks like base64
                if (/^[A-Za-z0-9+/=]+$/.test(value)) {
                    revived[key] = Buffer.from(value, 'base64');
                    continue;
                }
            } catch (e) {}
        }
        revived[key] = universalRevive(value);
    }
    return revived;
};

const AUTH_FOLDER = path.join(process.cwd(), 'data', '.baileys_auth');
const STORE_FILE = path.join(process.cwd(), 'data', 'whatsapp_store.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
}

/**
 * WhatsApp Status Enum
 */
const WhatsAppStatus = {
    INITIALIZING: 'INITIALIZING',
    WAITING_FOR_QR: 'WAITING_FOR_QR',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    ERROR: 'ERROR',
    DISCONNECTED: 'DISCONNECTED'
};

class WhatsAppManager {
    constructor() {
        this.sock = null;
        this.status = WhatsAppStatus.DISCONNECTED;
        this.lastError = null;
        this.currentQrCode = null;
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 5;
        this.contacts = new Map();
        this.recentChats = new Map();
        this.lastReceivedMessage = null;
        this.saveTimeout = null;
        this.qrHeartbeat = null;
    }

    /**
     * Initialize the service
     */
    async init() {
        if (this.status === WhatsAppStatus.INITIALIZING || this.status === WhatsAppStatus.CONNECTED) {
            return;
        }

        try {
            this.status = WhatsAppStatus.INITIALIZING;
            logger.info('[WhatsApp] Initializing Manager...');

            await loadBaileys();
            this.loadStore();

            // 1. Try to restore credentials from database
            const session = await this.restoreCredsFromDb();
            if (session?.lastQrCode) {
                this.currentQrCode = session.lastQrCode;
                logger.info('[WhatsApp] Restored cached QR code from database.');
            }

            // 2. Setup auth state (Custom Prisma implementation)
            const { state, saveCreds } = await this.usePrismaAuthState();
            
            let version = [2, 3000, 1015901307]; // Fallback version
            try {
                const latest = await fetchLatestBaileysVersion().catch(() => null);
                if (latest) version = latest.version;
            } catch (err) {
                logger.warn('[WhatsApp] Failed to fetch latest Baileys version, using fallback.');
            }

            // Re-use main logger instead of file for Render to avoid filesystem issues
            const baileysLogger = P({ level: 'error' }); 

            // 3. Create Socket
            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
                },
                logger: baileysLogger,
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                syncFullHistory: false, 
                markOnlineOnConnect: false,
            });

            this.setupListeners(saveCreds);
            this.lastError = null;
            logger.info('[WhatsApp] Manager initialized and socket created.');
        } catch (err) {
            this.status = WhatsAppStatus.ERROR;
            this.lastError = err.message;
            this.currentQrCode = null; // Clear stale QR on failure
            logger.error('[WhatsApp] Global initialization failed:', err.message);
            this.scheduleReconnect();
        }
    }

    setupListeners(saveCreds) {
        // Creds Update
        this.sock.ev.on('creds.update', async () => {
            await saveCreds();
        });

        // Connection Update
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (connection) {
                logger.info(`[WhatsApp] Connection: ${connection}`);
                if (connection === 'connecting') this.status = WhatsAppStatus.CONNECTING;
            }

            if (qr) {
                this.status = WhatsAppStatus.WAITING_FOR_QR;
                this.reconnectAttempts = 0;
                try {
                    this.currentQrCode = await qrcode.toDataURL(qr, { margin: 2, scale: 8 });
                    notifyUser('system', 'WHATSAPP_QR', { qr: this.currentQrCode });
                    
                    // Persist to DB immediately
                    await prisma.whatsAppSession.upsert({
                        where: { id: 'singleton' },
                        update: { lastQrCode: this.currentQrCode },
                        create: { id: 'singleton', creds: {}, lastQrCode: this.currentQrCode }
                    }).catch(e => logger.warn('[WhatsApp] Failed to persist QR to DB:', e.message));
                    
                    logger.info('[WhatsApp] New QR code generated and persisted.');
                } catch (err) {
                    logger.error('[WhatsApp] Failed to process QR:', err.message);
                }
            }

            if (connection === 'open') {
                this.status = WhatsAppStatus.CONNECTED;
                this.currentQrCode = null;
                this.reconnectAttempts = 0;
                logger.info('✅ WhatsApp Connected!');
                notifyUser('system', 'WHATSAPP_READY', { status: 'connected' });
            }

            if (connection === 'close') {
                this.status = WhatsAppStatus.DISCONNECTED;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut;
                
                logger.warn(`[WhatsApp] Closed with status: ${statusCode}. Logged out: ${loggedOut}`);
                
                if (loggedOut) {
                    await this.wipeSession();
                } else {
                    this.scheduleReconnect();
                }
            }
        });

        // Messaging History
        this.sock.ev.on('messaging-history.set', ({ contacts, chats }) => {
            if (contacts) {
                contacts.forEach(c => {
                    const name = c.name || c.verifiedName || c.notify;
                    if (name && !c.id.includes('@newsletter')) {
                        this.contacts.set(c.id, name);
                    }
                });
            }
            if (chats) {
                chats.forEach(c => {
                    if (!c.id.includes('@newsletter')) this.recentChats.set(c.id, c);
                });
            }
            this.saveStore();
        });

        // Contact Sync (Real-time)
        this.sock.ev.on('contacts.upsert', (contacts) => {
            contacts.forEach(c => {
                const name = c.name || c.verifiedName || c.notify;
                if (name && !c.id.includes('@newsletter')) {
                    this.contacts.set(c.id, name);
                }
            });
            this.saveStore();
        });

        this.sock.ev.on('contacts.update', (updates) => {
            updates.forEach(u => {
                if (u.name || u.verifiedName || u.notify) {
                    const name = u.name || u.verifiedName || u.notify;
                    if (!u.id.includes('@newsletter')) {
                        this.contacts.set(u.id, name);
                    }
                }
            });
            this.saveStore();
        });

        // Messages Upsert
        this.sock.ev.on('messages.upsert', (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderJid = msg.key.remoteJid;
            const senderName = msg.pushName || this.contacts.get(senderJid) || senderJid;
            const content = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Media/Other]';

            logger.info(`[WhatsApp] Msg from ${senderName}: ${content}`);

            const chat = this.recentChats.get(senderJid) || { id: senderJid, name: senderName, unreadCount: 0 };
            chat.unreadCount = (chat.unreadCount || 0) + 1;
            this.recentChats.set(senderJid, chat);
            this.saveStore();

            this.lastReceivedMessage = { from: senderName, jid: senderJid, text: content, timestamp: Date.now() };

            notifyUser('system', 'WHATSAPP_MESSAGE', { from: senderName, jid: senderJid, text: content });
        });
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            const delay = this.reconnectAttempts * 5000;
            logger.info(`[WhatsApp] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
            setTimeout(() => this.init(), delay);
        } else {
            logger.error('[WhatsApp] Max reconnect attempts reached.');
            this.status = WhatsAppStatus.ERROR;
        }
    }

    /**
     * Custom Baileys Authentication Provider for Prisma
     */
    async usePrismaAuthState() {
        const { initAuthCreds } = await import('@whiskeysockets/baileys');

        const readData = async (type, id) => {
            try {
                const key = await prisma.whatsAppKey.findUnique({ where: { id: `${type}-${id}` } });
                if (!key) return null;
                // key.data is already an object from Prisma, but contains "Buffer-masked" objects
                return universalRevive(key.data);
            } catch (err) {
                logger.error(`[WhatsApp] Read error for ${type}-${id}: ${err.message}`);
                return null;
            }
        };

        const writeData = async (data, type, id) => {
            try {
                // serialized is a plain object with Buffers replaced by {type:'Buffer', data:...}
                const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
                await prisma.whatsAppKey.upsert({
                    where: { id: `${type}-${id}` },
                    update: { data: serialized },
                    create: { id: `${type}-${id}`, data: serialized }
                });
            } catch (err) {
                logger.error(`[WhatsApp] Failed to write key ${type}-${id}: ${err.message}`);
            }
        };

        const removeData = async (type, id) => {
            try {
                await prisma.whatsAppKey.delete({ where: { id: `${type}-${id}` } }).catch(() => {});
            } catch (err) {}
        };

        const credsRecord = await prisma.whatsAppSession.findUnique({ where: { id: 'singleton' } });
        let creds = credsRecord?.creds ? universalRevive(credsRecord.creds) : initAuthCreds();

        return {
            state: {
                creds,
                keys: {
                    get: async (type, ids) => {
                        const data = {};
                        await Promise.all(
                            ids.map(async (id) => {
                                let value = await readData(type, id);
                                if (type === 'app-state-sync-key' && value) {
                                    const { proto } = await import('@whiskeysockets/baileys');
                                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                }
                                data[id] = value;
                            })
                        );
                        return data;
                    },
                    set: async (data) => {
                        const tasks = [];
                        for (const category in data) {
                            for (const id in data[category]) {
                                const value = data[category][id];
                                if (value) {
                                    tasks.push(writeData(value, category, id));
                                } else {
                                    tasks.push(removeData(category, id));
                                }
                            }
                        }
                        await Promise.all(tasks);
                    },
                },
            },
            saveCreds: async () => {
                try {
                    const serialized = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
                    await prisma.whatsAppSession.upsert({
                        where: { id: 'singleton' },
                        update: { creds: serialized },
                        create: { id: 'singleton', creds: serialized }
                    });
                } catch (err) {
                    logger.error(`[WhatsApp] Failed to save creds: ${err.message}`);
                }
            },
        };
    }

    async restoreCredsFromDb() {
        return await prisma.whatsAppSession.findUnique({ where: { id: 'singleton' } });
    }

    async wipeSession() {
        logger.warn('[WhatsApp] Wiping session...');
        if (this.sock) {
            try { this.sock.logout(); } catch (e) {}
            this.sock = null;
        }
        this.status = WhatsAppStatus.DISCONNECTED;
        this.currentQrCode = null;
        this.contacts.clear();
        this.recentChats.clear();
        
        if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
        
        try {
            await prisma.whatsAppSession.delete({ where: { id: 'singleton' } }).catch(() => {});
            await prisma.whatsAppKey.deleteMany({}).catch(() => {});
        } catch (e) {}
        
        logger.info('[WhatsApp] Session wiped.');
    }

    loadStore() {
        try {
            if (fs.existsSync(STORE_FILE)) {
                const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
                if (data.contacts) this.contacts = new Map(data.contacts);
                if (data.chats) this.recentChats = new Map(data.chats);
                logger.info(`[WhatsApp] Loaded ${this.contacts.size} contacts from store.`);
            }
        } catch (err) {
            logger.error('[WhatsApp] Store load failed:', err.message);
        }
    }

    saveStore() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            try {
                const data = {
                    contacts: Array.from(this.contacts.entries()),
                    chats: Array.from(this.recentChats.entries())
                };
                fs.writeFileSync(STORE_FILE, JSON.stringify(data));
            } catch (err) {
                logger.error('[WhatsApp] Store save failed:', err.message);
            }
        }, 5000);
    }

    getStatus() {
        return {
            status: this.status,
            lastError: this.lastError,
            isReady: this.status === WhatsAppStatus.CONNECTED,
            hasQr: !!this.currentQrCode,
            contactsCount: this.contacts.size,
            chatsCount: this.recentChats.size,
            syncing: this.status === WhatsAppStatus.CONNECTED && this.contacts.size < 5
        };
    }

    async send(to, text) {
        if (this.status !== WhatsAppStatus.CONNECTED || !this.sock) {
            throw new AppError('WhatsApp not connected', 503);
        }
        
        const cleaned = String(to).replace(/\D/g, '');
        let jid = cleaned.length >= 10 ? `${cleaned.length === 10 ? '91' : ''}${cleaned}@s.whatsapp.net` : null;

        if (!jid) {
            const query = String(to).toLowerCase();
            const contact = Array.from(this.contacts.entries()).find(([_, name]) => name.toLowerCase().includes(query));
            if (contact) jid = contact[0];
        }

        if (!jid) throw new AppError('Contact not found', 404);
        
        await this.sock.sendMessage(jid, { text });
        return { to, jid, status: 'sent' };
    }

    async requestPairingCode(phoneNumber) {
        if (this.status === WhatsAppStatus.CONNECTED) return null;
        if (!this.sock) await this.init();
        
        try {
            const code = await this.sock.requestPairingCode(phoneNumber);
            return code;
        } catch (err) {
            logger.error('[WhatsApp] Pairing code request failed:', err.message);
            throw new AppError('Failed to generate pairing code', 500);
        }
    }
}

const manager = new WhatsAppManager();

module.exports = {
    initWhatsApp: () => manager.init(),
    getQrCode: () => manager.currentQrCode,
    getStatus: () => manager.getStatus(),
    getRecentChats: async (limit = 10) => {
        return Array.from(manager.recentChats.values()).slice(0, limit).map(c => ({
            id: c.id,
            name: c.name || manager.contacts.get(c.id) || c.id,
            unreadCount: c.unreadCount || 0
        }));
    },
    sendWhatsAppMessage: (to, text) => manager.send(to, text),
    requestPairingCode: (phone) => manager.requestPairingCode(phone),
    resetSession: () => manager.wipeSession(),
    getLastReceivedMessage: () => manager.lastReceivedMessage,
    WhatsAppStatus // Export enum for controller
};
