const AUTH_COOKIE_NAME = 'qm-management-session';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const DEV_AUTH_SECRET = 'dev-auth-secret-change-me';

function getSessionMaxAgeSeconds() {
  const raw = Number(process.env.SESSION_MAX_AGE_SECONDS ?? DEFAULT_SESSION_MAX_AGE_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  return Math.floor(raw);
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_AUTH_SECRET;
  }

  throw new Error('AUTH_SECRET must be set in production.');
}

function getConfiguredUsername() {
  const username = process.env.APP_USERNAME?.trim();
  if (username) {
    return username;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'admin';
  }

  throw new Error('APP_USERNAME must be set in production.');
}

function getConfiguredPassword() {
  const password = process.env.APP_PASSWORD;
  if (password) {
    return password;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'admin';
  }

  throw new Error('APP_PASSWORD must be set in production.');
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (Number.isNaN(value)) {
      return null;
    }
    bytes[index / 2] = value;
  }
  return bytes;
}

async function importHmacKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signPayload(payload: string) {
  const key = await importHmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

export async function createSessionToken(username: string) {
  const encodedUsername = encodeURIComponent(username);
  const expiresAt = Math.floor(Date.now() / 1000) + getSessionMaxAgeSeconds();
  const payload = `${encodedUsername}.${expiresAt}`;
  const signature = await signPayload(payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const [encodedUsername, expiresAtRaw, signatureHex] = parts;
  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const signature = hexToBytes(signatureHex);
  if (!signature) {
    return false;
  }

  const payload = `${encodedUsername}.${expiresAtRaw}`;
  const key = await importHmacKey();
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    new TextEncoder().encode(payload),
  );

  if (!isValid) {
    return false;
  }

  return decodeURIComponent(encodedUsername) === getConfiguredUsername();
}

export function getSessionCookieName() {
  return AUTH_COOKIE_NAME;
}

export function getLoginCredentials() {
  return {
    username: getConfiguredUsername(),
    password: getConfiguredPassword(),
  };
}

export function getSessionMaxAge() {
  return getSessionMaxAgeSeconds();
}
