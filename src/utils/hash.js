'use strict';

const bcrypt = require('bcryptjs');
const { bcrypt: bcryptConfig } = require('../config/env');

/**
 * Hash a plain-text password.
 */
const hashPassword = async (password) => bcrypt.hash(password, bcryptConfig.saltRounds);

/**
 * Compare plain-text password against stored hash.
 * Returns boolean.
 */
const comparePassword = async (password, hash) => bcrypt.compare(password, hash);

module.exports = { hashPassword, comparePassword };
