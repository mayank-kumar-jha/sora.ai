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

            // 2. Setup auth state
            const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
            
            let version = [2, 3000, 1015901307]; // Fallback version
            try {
                const latest = await fetchLatestBaileysVersion().catch(() => null);
                if (latest) version = latest.version;
            } catch (err) {
                logger.warn('[WhatsApp] Failed to fetch latest Baileys version, using fallback.');
            }

            const baileysLogFile = path.join(process.cwd(), 'logs', 'baileys.log');
            if (!fs.existsSync(path.dirname(baileysLogFile))) fs.mkdirSync(path.dirname(baileysLogFile), { recursive: true });
            
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
                syncFullHistory: false, // Set to false to reduce initial load on Render
                markOnlineOnConnect: false,
            });

            this.setupListeners(saveCreds, state);
            this.lastError = null;
            logger.info('[WhatsApp] Manager initialized and socket created.');
        } catch (err) {
            this.status = WhatsAppStatus.ERROR;
            this.lastError = err.message;
            logger.error('[WhatsApp] Global initialization failed:', err.message);
            this.scheduleReconnect();
        }
    }

    setupListeners(saveCreds, state) {
        // Creds Update
        this.sock.ev.on('creds.update', async () => {
            await saveCreds();
            try {
                // state.creds contains Buffers. We must use BufferJSON to correctly handle them for Prisma JSON field.
                const serialized = JSON.parse(JSON.stringify(state.creds, BufferJSON.replacer));
                await prisma.whatsAppSession.upsert({
                    where: { id: 'singleton' },
                    update: { creds: serialized },
                    create: { id: 'singleton', creds: serialized }
                });
            } catch (err) {
                logger.error('[WhatsApp] Failed to save creds to DB:', err.message);
            }
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
                        create: { id: 'singleton', creds: state.creds, lastQrCode: this.currentQrCode }
                    });
                    
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

    async restoreCredsFromDb() {
        try {
            if (!fs.existsSync(AUTH_FOLDER) || fs.readdirSync(AUTH_FOLDER).length === 0) {
                const session = await prisma.whatsAppSession.findUnique({ where: { id: 'singleton' } });
                if (session && session.creds) {
                    logger.info('[WhatsApp] Restoring credentials from DB...');
                    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
                    
                    // session.creds is an object. useMultiFileAuthState expects a JSON string with specific Buffer markers.
                    const credsContent = JSON.stringify(session.creds, BufferJSON.replacer);
                    fs.writeFileSync(path.join(AUTH_FOLDER, 'creds.json'), credsContent);
                    return session;
                }
            }
        } catch (err) {
            logger.error('[WhatsApp] DB restoration failed:', err.message);
        }
        return null;
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
