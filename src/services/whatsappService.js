'use strict';

const qrcode = require('qrcode');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');
const path = require('path');
const fs = require('fs');
const prisma = require('../config/database');

// Baileys imports (lazy loaded)
let makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, BufferJSON;

// Fix for Windows connection failures in Node 18+
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

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

    // Suppress noisy Baileys internal warnings that bypass pino logger
    const origWarn = console.warn;
    console.warn = (...args) => {
      const msg = args[0];
      if (typeof msg === 'string' && (
        msg.includes('Decrypted message with closed session') ||
        msg.includes('Error: Decrypted message')
      )) return;
      origWarn.apply(console, args);
    };
  }
};

// Deep-revive Buffer objects from Prisma JSON storage
const reviveBuffers = (data) => {
  if (!data) return data;
  try {
    // If we have Baileys loaded, use their official reviver for perfect compatibility
    if (BufferJSON) {
      return JSON.parse(JSON.stringify(data), BufferJSON.reviver);
    }

    // Fallback: Robust manual revival for pre-Baileys-load scenarios
    if (typeof data !== 'object') return data;
    if (data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
    if (data instanceof Uint8Array) return Buffer.from(data);
    if (Array.isArray(data)) return data.map(reviveBuffers);

    const result = {};
    for (const [k, v] of Object.entries(data)) {
      result[k] = reviveBuffers(v);
    }
    return result;
  } catch (err) {
    return data;
  }
};

const STORE_FILE = path.join(process.cwd(), 'data', 'whatsapp_store.json');

// Ensure data dir
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
}

/**
 * Custom Prisma-backed Auth Provider for Baileys.
 * This guarantees that WhatsApp sessions survive container rebuilds on Render/Vercel.
 */
const usePrismaAuthState = async () => {
  const { initAuthCreds } = await import('@whiskeysockets/baileys');
  let creds;

  const session = await prisma.whatsAppSession.findUnique({ where: { id: 'singleton' } });
  if (session && session.creds && Object.keys(session.creds).length > 0) {
    creds = JSON.parse(JSON.stringify(session.creds), BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    return prisma.whatsAppSession.upsert({
      where: { id: 'singleton' },
      update: { creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)) },
      create: { id: 'singleton', creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)) },
    });
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await prisma.whatsAppKey.findUnique({ where: { id: `${type}-${id}` } });
              if (value && value.data) {
                let parsed = JSON.parse(JSON.stringify(value.data), BufferJSON.reviver);
                if (type === 'app-state-sync-key' && parsed) {
                  // Baileys requires app-state-sync-key to be parsed specially
                  const { proto } = await import('@whiskeysockets/baileys');
                  parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
                }
                data[id] = parsed;
              }
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const keyId = `${category}-${id}`;
              if (value) {
                const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
                tasks.push(
                  prisma.whatsAppKey.upsert({
                    where: { id: keyId },
                    update: { data: serialized },
                    create: { id: keyId, data: serialized },
                  })
                );
              } else {
                tasks.push(prisma.whatsAppKey.deleteMany({ where: { id: keyId } }).catch(() => { }));
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds,
  };
};

class WhatsAppManager {
  constructor() {
    this.sock = null;
    this.status = 'DISCONNECTED';
    this.currentQrCode = null;
    this.reconnectAttempts = 0;
    this.contacts = new Map();
    this.registeredContacts = {};
    this.recentChats = new Map();
    this.lastMessage = null;
    this.saveTimeout = null;
    this.qrGeneratedAt = null;
    this.lastError = null;
    this.pairingCodePending = false;
    this.pendingPairingNumber = null;
    this.pendingPairingResolve = null;
    this.pendingPairingReject = null;
    this.reconnectTimer = null; // So we can cancel pending reconnects
    this.initInProgress = false; // Prevent dual init() calls
  }

  async init() {
    // Prevent two init() calls from running at the same time
    if (this.initInProgress) {
      logger.warn('[WhatsApp] init() already in progress, skipping duplicate call');
      return;
    }
    this.initInProgress = true;
    this.status = 'INITIALIZING';
    this.lastError = null;
    this.currentQrCode = null;
    this.qrGeneratedAt = null;

    // Cancel any pending reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // destroy old socket if exists
    if (this.sock) {
      try { this.sock.end(); } catch (_) { }
      this.sock = null;
    }

    try {
      logger.info('[WhatsApp] Init starting...');
      await loadBaileys();
      logger.info('[WhatsApp] Baileys modules loaded');
      this.loadStore();

      // Use Prisma-backed auth state to survive serverless redeploys
      const { state, saveCreds } = await usePrismaAuthState();
      logger.info('[WhatsApp] Auth state built (Prisma-backed)');

      // Fetch the latest WA version so the Noise handshake always passes
      let version;
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
        logger.info(`[WhatsApp] Using WA version: ${version}`);
      } catch (err) {
        version = [2, 3000, 1015901307];
        logger.warn(`[WhatsApp] Version fetch failed, using fallback: ${version}`);
      }

      const P = require('pino');
      const loggerP = P({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, loggerP)
        },
        logger: loggerP,
        printQRInTerminal: false,
        browser: ['Windows', 'Chrome', '20.0.04'], // WA pairing strict profile
        connectTimeoutMs: 120000,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => ({ conversation: 'Kaaya AI' }),
      });

      this.listen(saveCreds);
      logger.info('[WhatsApp] Socket created and listening');
    } catch (err) {
      this.status = 'ERROR';
      this.lastError = err.message;
      logger.error(`[WhatsApp] Init failed: ${err.message}`);
      this.scheduleReconnect();
    } finally {
      this.initInProgress = false;
    }
  }

  listen(saveCreds) {
    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = 'WAITING_FOR_QR';
        this.reconnectAttempts = 0;
        this.qrGeneratedAt = new Date();
        try {
          this.currentQrCode = await qrcode.toDataURL(qr, { margin: 2, scale: 8 });
          const { notifyUser } = require('./socketService');
          notifyUser('system', 'whatsapp:qr', { qr: this.currentQrCode });
          logger.info(`[WhatsApp] New QR generated at ${this.qrGeneratedAt.toISOString()}`);

          await prisma.whatsAppSession.upsert({
            where: { id: 'singleton' },
            update: { lastQrCode: this.currentQrCode },
            create: { id: 'singleton', creds: {}, lastQrCode: this.currentQrCode },
          }).catch(() => { });

          // If a pairing code was requested, generate it now while the socket is live
          if (this.pendingPairingNumber && this.sock) {
            try {
              await new Promise(r => setTimeout(r, 1500)); // Small delay for WA readiness
              const code = await this.sock.requestPairingCode(this.pendingPairingNumber);
              logger.info(`[WhatsApp] Pairing code generated: ${code}`);
              if (this.pendingPairingResolve) this.pendingPairingResolve(code);
            } catch (pairErr) {
              logger.error(`[WhatsApp] Pairing code failed: ${pairErr.message}`);
              if (this.pendingPairingReject) this.pendingPairingReject(pairErr);
            } finally {
              this.pendingPairingNumber = null;
              this.pendingPairingResolve = null;
              this.pendingPairingReject = null;
            }
          }
        } catch (err) {
          logger.error(`[WhatsApp] QR failed: ${err.message}`);
        }
      }

      if (connection === 'open') {
        this.status = 'CONNECTED';
        this.currentQrCode = null;
        this.qrGeneratedAt = null;
        this.reconnectAttempts = 0;
        this.lastError = null;
        this.pairingCodePending = false; // Pairing complete!
        logger.info('✅ WhatsApp Connected!');
        const { notifyUser } = require('./socketService');
        notifyUser('system', 'whatsapp:ready', { status: 'connected' });
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'unknown';

        logger.warn(`[WhatsApp] Connection closed: ${reason} (code: ${code})`);
        this.status = 'DISCONNECTED';
        this.lastError = reason;

        if (code === DisconnectReason.loggedOut) {
          this.pairingCodePending = false;
          await this.wipe();
        } else if (this.pairingCodePending) {
          // Phone is linking — reconnect IMMEDIATELY with same auth
          // so the WA server has an active socket for the handshake
          logger.info('[WhatsApp] Pairing in progress — reconnecting immediately (same auth)');
          setTimeout(() => this.init(), 1000);
        } else {
          this.scheduleReconnect();
        }
      }
    });

    // Contact sync
    this.sock.ev.on('messaging-history.set', ({ contacts, chats }) => {
      if (contacts) contacts.forEach((c) => {
        const name = c.name || c.verifiedName || c.notify;
        if (name && !c.id.includes('@newsletter')) this.contacts.set(c.id, name);
      });
      if (chats) chats.forEach((c) => {
        if (!c.id.includes('@newsletter')) this.recentChats.set(c.id, c);
      });
      this.saveStore();
    });

    this.sock.ev.on('contacts.upsert', (contacts) => {
      contacts.forEach((c) => {
        const name = c.name || c.verifiedName || c.notify;
        if (name && !c.id.includes('@newsletter')) this.contacts.set(c.id, name);
      });
      this.saveStore();
    });

    // Incoming messages
    this.sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const jid = msg.key.remoteJid;
      if (jid.endsWith('@g.us')) return; // Ignore group chats

      const name = msg.pushName || jid.split('@')[0];
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Media]';

      logger.info(`[WhatsApp] Message from ${name}: ${text}`);
      this.lastMessage = { from: name, jid, text, timestamp: Date.now() };

      const { notifyUser } = require('./socketService');
      notifyUser('system', 'whatsapp:message', { from: name, jid, text });
    });
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = this.reconnectAttempts * 5000;
      logger.info(`[WhatsApp] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`);
      this.reconnectTimer = setTimeout(() => this.init(), delay);
    } else {
      this.status = 'ERROR';
      logger.error('[WhatsApp] Max reconnect attempts reached');
    }
  }

  async wipe() {
    logger.warn('[WhatsApp] Wiping session...');
    if (this.sock) { try { this.sock.end(); } catch (_) { } this.sock = null; }
    this.status = 'DISCONNECTED';
    this.currentQrCode = null;
    this.contacts.clear();
    this.recentChats.clear();

    // Clean filesystem auth
    const authDir = path.join(process.cwd(), 'data', 'auth');
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    // Clean Prisma records
    try {
      await prisma.whatsAppSession.delete({ where: { id: 'singleton' } }).catch(() => { });
      await prisma.whatsAppKey.deleteMany({}).catch(() => { });
    } catch (_) { }
    if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
    logger.info('[WhatsApp] Session wiped');
  }




  /**
   * Request an 8-character pairing code string that the user can enter
   * in the "Link with phone number" section of the WhatsApp app.
   */
  async requestPairingCode(phoneNumber) {
    // Clean phone number (digits only)
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber) throw new Error('Invalid phone number format');

    // Cancel any pending reconnect timers to prevent dual sockets
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Mark pairing as pending — connection handler will reconnect
    // immediately (instead of with backoff) to keep the socket alive
    this.pairingCodePending = true;
    this.reconnectAttempts = 0;
    logger.info('[WhatsApp] Pairing code requested — fast-reconnect mode active');

    // Store the number so the QR handler can request the code on a LIVE socket
    return new Promise((resolve, reject) => {
      this.pendingPairingNumber = cleanNumber;
      this.pendingPairingResolve = resolve;
      this.pendingPairingReject = reject;

      // If we already have a QR (socket is live), request immediately
      if (this.currentQrCode && this.sock) {
        (async () => {
          try {
            await new Promise(r => setTimeout(r, 1500));
            const code = await this.sock.requestPairingCode(cleanNumber);
            logger.info(`[WhatsApp] Pairing code generated: ${code}`);
            resolve(code);
          } catch (err) {
            logger.error(`[WhatsApp] Pairing code failed: ${err.message}`);
            reject(err);
          } finally {
            this.pendingPairingNumber = null;
            this.pendingPairingResolve = null;
            this.pendingPairingReject = null;
          }
        })();
        return;
      }

      // Otherwise wait — an init() is likely already running or
      // will be triggered by the reconnect loop. The QR handler
      // will pick up pendingPairingNumber when a QR arrives.
      // If no socket exists at all, trigger one fresh init.
      if (!this.sock && !this.initInProgress) {
        this.init();
      }

      // Safety timeout: reject if no code generated within 30s
      setTimeout(() => {
        if (this.pendingPairingNumber) {
          this.pendingPairingNumber = null;
          this.pendingPairingResolve = null;
          this.pendingPairingReject = null;
          this.pairingCodePending = false;
          reject(new Error('Pairing code generation timed out'));
        }
      }, 30000);
    });
  }

  loadStore() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const d = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        if (d.contacts) this.contacts = new Map(d.contacts);
        if (d.chats) this.recentChats = new Map(d.chats);
        if (d.registeredContacts) this.registeredContacts = d.registeredContacts;
      }
    } catch (_) { }
  }

  saveStore() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(STORE_FILE, JSON.stringify({
          contacts: Array.from(this.contacts.entries()),
          chats: Array.from(this.recentChats.entries()),
          registeredContacts: this.registeredContacts,
        }));
      } catch (_) { }
    }, 5000);
  }

  getStatus() {
    return {
      status: this.status,
      isReady: this.status === 'CONNECTED',
      hasQr: !!this.currentQrCode,
      qrGeneratedAt: this.qrGeneratedAt,
      contactsCount: this.contacts.size,
      lastError: this.lastError
    };
  }

  async send(to, text) {
    if (this.status !== 'CONNECTED' || !this.sock) throw new AppError('WhatsApp not connected', 503);

    const cleaned = String(to).replace(/\D/g, '');
    let jid = cleaned.length >= 10 ? `${cleaned.length === 10 ? '91' : ''}${cleaned}@s.whatsapp.net` : null;

    if (!jid) {
      const query = String(to).toLowerCase().trim();
      
      // 1. Check manually registered contacts first
      // Find a partial/exact match in registered contacts dictionary
      const registeredMatchKey = Object.keys(this.registeredContacts).find(name => name.toLowerCase().includes(query));
      if (registeredMatchKey) {
         const ph = this.registeredContacts[registeredMatchKey].replace(/\D/g, '');
         jid = ph.length >= 10 ? `${ph.length === 10 ? '91' : ''}${ph}@s.whatsapp.net` : null;
         logger.info(`[WhatsApp] Match found in registeredContacts for "${query}" -> ${jid}`);
      }
      
      // 2. Fall back to phone address book
      if (!jid) {
        const phonebookMatch = Array.from(this.contacts.entries()).find(([_, name]) => name.toLowerCase().includes(query));
        if (phonebookMatch) {
          jid = phonebookMatch[0];
          logger.info(`[WhatsApp] Fallback match found in phonebook for "${query}" -> ${jid}`);
        }
      }
    }

    if (!jid) throw new AppError(`Contact "${to}" not found`, 404);

    logger.info(`[WhatsApp] Sending message to ${jid}: ${text}`);
    try {
      await this.sock.sendMessage(jid, { text });
      logger.info(`[WhatsApp] Message successfully sent to ${jid}`);
      return { to, jid, status: 'sent' };
    } catch (err) {
      logger.error(`[WhatsApp] Error sending message to ${jid}: ${err.message}`);
      throw err;
    }
  }
}

const manager = new WhatsAppManager();

module.exports = {
  initWhatsApp: () => manager.init(),
  getQrCode: () => manager.currentQrCode,
  getStatus: () => manager.getStatus(),
  requestPairingCode: (phoneNumber) => manager.requestPairingCode(phoneNumber),
  sendWhatsAppMessage: (to, text) => manager.send(to, text),
  registerContact: (name, number) => { 
    manager.registeredContacts[name.toLowerCase()] = number; 
    manager.saveStore();
  },
  resetSession: async () => {
    await manager.wipe();
    setTimeout(() => manager.init(), 1000);
  },
  getLastMessage: () => manager.lastMessage,
  getContacts: () => Array.from(manager.contacts.entries()).map(([id, name]) => ({ id, name })),
  getRecentChats: (limit = 10) => Array.from(manager.recentChats.values()).slice(0, limit).map((c) => ({
    id: c.id, name: c.name || manager.contacts.get(c.id) || c.id,
  })),
};
