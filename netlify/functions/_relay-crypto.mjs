import crypto from 'node:crypto';

export const RELAY_PROTOCOL = 'wr1';

export function normalizeOrigin(value) {
  const url = new URL(String(value || '').trim());
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported site origin.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS is required.');
  return url.origin;
}

export function relaySecret(value = process.env.WEAVERELAY_CLIENT_SECRET) {
  const secret = String(value || '');
  if (secret.length < 32) throw new Error('WEAVERELAY_CLIENT_SECRET must be at least 32 characters.');
  return secret;
}

export function canonicalHandshake({ clientId, siteOrigin, timestamp, nonce, providers, snapshotDigest = '' }) {
  const normalizedProviders = [...new Set((providers || []).map(String))].sort();
  return JSON.stringify({
    clientId: String(clientId || '').trim(),
    siteOrigin: normalizeOrigin(siteOrigin),
    timestamp: Number(timestamp),
    nonce: String(nonce || ''),
    providers: normalizedProviders,
    snapshotDigest: String(snapshotDigest || ''),
  });
}

export function signHandshake(payload, secret = relaySecret()) {
  return crypto.createHmac('sha256', secret).update(canonicalHandshake(payload)).digest('base64url');
}

export function verifyHandshake(payload, signature, secret = relaySecret(), now = Date.now()) {
  const timestamp = Number(payload?.timestamp || 0);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 5 * 60_000) return false;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(payload?.nonce || ''))) return false;
  const expected = Buffer.from(signHandshake(payload, secret));
  const received = Buffer.from(String(signature || ''));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function ticketKey(secret = relaySecret()) {
  return crypto.createHash('sha256').update(`ticket:${secret}`).digest();
}

export function issueTicket(claims, { ttlMs = 15 * 60_000, secret = relaySecret(), now = Date.now() } = {}) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ticketKey(secret), iv);
  cipher.setAAD(Buffer.from(RELAY_PROTOCOL));
  const body = Buffer.from(JSON.stringify({ ...claims, iat: now, exp: now + ttlMs }));
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [RELAY_PROTOCOL, iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join('.');
}

export function readTicket(token, { secret = relaySecret(), now = Date.now() } = {}) {
  const [version, ivText, bodyText, tagText, extra] = String(token || '').split('.');
  if (version !== RELAY_PROTOCOL || !ivText || !bodyText || !tagText || extra) throw new Error('Invalid WeaveRelay ticket.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ticketKey(secret), Buffer.from(ivText, 'base64url'));
  decipher.setAAD(Buffer.from(RELAY_PROTOCOL));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(bodyText, 'base64url')), decipher.final()]);
  const claims = JSON.parse(plain.toString('utf8'));
  if (!claims.exp || Number(claims.exp) < now) throw new Error('This WeaveRelay ticket has expired.');
  return claims;
}

export function workspaceId(clientId, siteOrigin) {
  return crypto.createHash('sha256').update(`${String(clientId || '').trim()}\n${normalizeOrigin(siteOrigin)}`).digest('hex').slice(0, 32);
}
