import crypto from "node:crypto";

const VERSION = "v1";

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function secretKey(secret) {
  const key = Buffer.from(String(secret || ""), "base64");
  if (key.length !== 32) {
    throw new Error("WAITLIST_TOKEN_SECRET must be a base64-encoded 32-byte secret.");
  }
  return key;
}

export function createVerificationToken(email, secret, now = Date.now(), ttlMs = 30 * 60 * 1000) {
  const payload = JSON.stringify({ email, iat: now, exp: now + ttlMs });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(secret), iv);
  cipher.setAAD(Buffer.from(VERSION));
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function readVerificationToken(token, secret, now = Date.now()) {
  const [version, ivPart, dataPart, tagPart, extra] = String(token || "").split(".");
  if (version !== VERSION || !ivPart || !dataPart || !tagPart || extra) {
    throw new Error("Invalid verification link.");
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(secret), Buffer.from(ivPart, "base64url"));
    decipher.setAAD(Buffer.from(VERSION));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const payload = JSON.parse(plaintext);
    if (!payload.email || !payload.exp || payload.exp < now) throw new Error("Expired verification link.");
    return payload;
  } catch (error) {
    if (error.message === "Expired verification link.") throw error;
    throw new Error("Invalid verification link.");
  }
}

export function emailStorageKey(email) {
  return `verified/${crypto.createHash("sha256").update(email).digest("hex")}.json`;
}
