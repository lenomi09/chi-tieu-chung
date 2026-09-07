'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';

function sign(issuedAt) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(issuedAt)).digest('hex');
}

function createSessionToken() {
  const issuedAt = Date.now();
  return `${issuedAt}.${sign(issuedAt)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [issuedAtStr, sig] = token.split('.');
  const issuedAt = Number(issuedAtStr);
  if (!issuedAtStr || !sig || !Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) return false;

  const expected = sign(issuedAt);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAdminRequest(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  return verifySessionToken(token);
}

function setSessionCookie(res) {
  res.cookie(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAdmin(req, res, next) {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: 'Cần đăng nhập admin để thực hiện thao tác này' });
  }
  next();
}

module.exports = {
  ADMIN_PASSWORD,
  isAdminRequest,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
};
