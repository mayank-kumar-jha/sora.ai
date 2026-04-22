'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');

const generateTokens = (user) => {
  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
  return { accessToken, refreshToken };
};

const register = async ({ name, email, password }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');

  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const { accessToken, refreshToken } = generateTokens(user);

  // Save session
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const { accessToken, refreshToken } = generateTokens(user);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  };
};

const refreshTokens = async (oldRefreshToken) => {
  const session = await prisma.session.findUnique({ where: { refreshToken: oldRefreshToken } });
  if (!session || session.expiresAt < new Date()) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH');
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new AppError('User not found', 404);

  const { accessToken, refreshToken } = generateTokens(user);

  // Rotate: delete old, create new
  await prisma.session.delete({ where: { id: session.id } });
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken };
};

const logout = async (refreshToken) => {
  await prisma.session.deleteMany({ where: { refreshToken } }).catch(() => {});
};

module.exports = { register, login, refreshTokens, logout };
