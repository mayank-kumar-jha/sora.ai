'use strict';

const crypto = require('crypto');
const AppError = require('./AppError');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.GOOGLE_ENCRYPTION_KEY; // Must be 32 characters
const IV_LENGTH = 16;

/**
 * Encrypt a string using AES-256-CBC.
 * @param {string} text - The text to encrypt.
 * @returns {string} - The encrypted string in format iv:encryptedData.
 */
function encrypt(text) {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        throw new AppError('Invalid GOOGLE_ENCRYPTION_KEY. Must be 32 characters.', 500, 'CRYPTO_ERROR');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt a string using AES-256-CBC.
 * @param {string} text - The encrypted string in format iv:encryptedData.
 * @returns {string} - The decrypted text.
 */
function decrypt(text) {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        throw new AppError('Invalid GOOGLE_ENCRYPTION_KEY. Must be 32 characters.', 500, 'CRYPTO_ERROR');
    }

    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = { encrypt, decrypt };
