import type { Context } from 'hono';
import type { Env, SessionData, User, OrgRole } from '../types';

export const SESSION_COOKIE_NAME = 'kas_session';
export const OAUTH_STATE_COOKIE_NAME = 'kas_oauth_state';

// Web Crypto HMAC-SHA256 Helper
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function signSession(session: SessionData, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const payloadStr = JSON.stringify(session);
  const payloadB64 = base64UrlEncode(enc.encode(payloadStr));

  const key = await getCryptoKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigB64 = base64UrlEncode(sig);

  return `${payloadB64}.${sigB64}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionData | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;

    const key = await getCryptoKey(secret);
    const enc = new TextEncoder();
    const sigBytes = base64UrlDecode(sigB64);

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payloadB64));
    if (!isValid) return null;

    const payloadBytes = base64UrlDecode(payloadB64);
    const dec = new TextDecoder();
    const session: SessionData = JSON.parse(dec.decode(payloadBytes));

    // Check expiration
    if (Date.now() > session.exp) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const [name, ...val] = item.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(val.join('='));
    }
  }
  return cookies;
}

export function sanitizeRedirectTarget(nextParam: string | undefined, baseDomain: string): string {
  if (!nextParam) return `https://${baseDomain}/`;
  if (nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    return nextParam; // Safe relative path
  }
  try {
    const parsed = new URL(nextParam);
    const host = parsed.hostname.toLowerCase();
    const base = baseDomain.toLowerCase();

    const isApex = host === base;
    const isDirectSubdomain =
      host.endsWith('.' + base) && host.slice(0, -(base.length + 1)).indexOf('.') === -1;
    const isLocalhost = host === 'localhost' || host.endsWith('.localhost');

    if ((parsed.protocol === 'https:' && (isApex || isDirectSubdomain)) || (parsed.protocol === 'http:' && isLocalhost)) {
      return parsed.toString();
    }
  } catch {
    // Ignore invalid url
  }
  return `https://${baseDomain}/`;
}

export async function getCurrentUser(c: Context<{ Bindings: Env }>): Promise<(User & { memberships: Record<number, OrgRole> }) | null> {
  const cookieHeader = c.req.header('Cookie');
  const cookies = parseCookies(cookieHeader || null);
  const sessionToken = cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) return null;

  const session = await verifySession(sessionToken, c.env.SESSION_SECRET);
  if (!session) return null;

  const db = c.env.DB;
  const user = await db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
    .bind(session.uid)
    .first<User>();

  if (!user) return null;

  // Load memberships
  const memberships = await db.prepare('SELECT org_id, role FROM org_memberships WHERE user_id = ?')
    .bind(user.id)
    .all<{ org_id: number; role: OrgRole }>();

  const membershipMap: Record<number, OrgRole> = {};
  for (const m of memberships.results) {
    membershipMap[m.org_id] = m.role;
  }

  return {
    ...user,
    memberships: membershipMap
  };
}

export function setSessionCookie(
  c: Context<{ Bindings: Env }>,
  token: string,
  isProduction: boolean,
  baseDomain: string
): void {
  const maxAge = 86400 * 7; // 7 days
  let cookieStr = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (isProduction) {
    cookieStr += `; Domain=.${baseDomain}; Secure`;
  }
  c.header('Set-Cookie', cookieStr, { append: true });
}

export function clearSessionCookie(
  c: Context<{ Bindings: Env }>,
  isProduction: boolean,
  baseDomain: string
): void {
  let cookieStr = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  if (isProduction) {
    cookieStr += `; Domain=.${baseDomain}; Secure`;
  }
  c.header('Set-Cookie', cookieStr, { append: true });
}
