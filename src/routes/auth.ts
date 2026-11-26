import { Hono } from 'hono';
import type { Env, User, SessionData } from '../types';
import {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  sanitizeRedirectTarget,
  OAUTH_STATE_COOKIE_NAME,
  parseCookies
} from '../lib/auth';
import { escapeHtml } from '../lib/format';
import { consumeFlash, redirectWithFlash } from '../lib/flash';
import { renderLayout } from '../views/layout';

export const authRoutes = new Hono<{ Bindings: Env }>();

// 1. Google OAuth Initiation
authRoutes.get('/google', async (c) => {
  const nextParam = c.req.query('next');
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const targetNext = sanitizeRedirectTarget(nextParam, baseDomain);

  const state = crypto.randomUUID();
  const statePayload = JSON.stringify({ state, next: targetNext });
  const stateB64 = btoa(statePayload);

  // Store state cookie
  const isProd = c.req.url.startsWith('https://');
  let stateCookie = `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(stateB64)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
  if (isProd) {
    stateCookie += `; Domain=.${baseDomain}; Secure`;
  }
  c.header('Set-Cookie', stateCookie);

  // Redirect URI is always centralized at the base domain or localhost
  const redirectUri = isProd
    ? `https://${baseDomain}/auth/google/callback`
    : `${new URL(c.req.url).origin}/auth/google/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', stateB64);
  authUrl.searchParams.set('prompt', 'select_account');

  return c.redirect(authUrl.toString());
});

// 2. Google OAuth Callback
authRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isProd = c.req.url.startsWith('https://');

  const cookies = parseCookies(c.req.header('Cookie') || null);
  const rawCookieState = cookies[OAUTH_STATE_COOKIE_NAME];

  if (!code || !stateParam || !rawCookieState) {
    return c.html(renderLayout({
      title: 'Login Gagal',
      user: null,
      baseDomain,
      content: `<div class="alert alert-error">State OAuth tidak valid atau sesi login kedaluwarsa. Silakan ulangi login.</div><a href="/auth/google" class="btn">&larr; Kembali ke Login</a>`
    }), 400);
  }

  let nextUrl = `https://${baseDomain}/`;
  try {
    const savedState = JSON.parse(atob(decodeURIComponent(rawCookieState)));
    if (savedState.state !== JSON.parse(atob(stateParam)).state) {
      throw new Error('State mismatch');
    }
    nextUrl = sanitizeRedirectTarget(savedState.next, baseDomain);
  } catch {
    return c.html(renderLayout({
      title: 'Login Gagal',
      user: null,
      baseDomain,
      content: `<div class="alert alert-error">Validasi keamanan CSRF OAuth gagal.</div><a href="/auth/google" class="btn">&larr; Kembali ke Login</a>`
    }), 400);
  }

  const redirectUri = isProd
    ? `https://${baseDomain}/auth/google/callback`
    : `${new URL(c.req.url).origin}/auth/google/callback`;

  // Exchange code for token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return c.html(renderLayout({
      title: 'Login Gagal',
      user: null,
      baseDomain,
      content: `<div class="alert alert-error">Gagal menukar token dengan Google: ${tokenData.error || 'Unknown'}</div>`
    }), 400);
  }

  // Fetch user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const googleUser = await userRes.json() as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!googleUser.email || !googleUser.email_verified) {
    return c.html(renderLayout({
      title: 'Login Ditolak',
      user: null,
      baseDomain,
      content: `<div class="alert alert-error">Email Google Anda belum diverifikasi oleh Google.</div>`
    }), 403);
  }

  const email = googleUser.email.toLowerCase().trim();
  const db = c.env.DB;

  // Check if email in SUPER_ADMIN_EMAILS
  const superEmails = (c.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const shouldBeSuper = superEmails.includes(email) ? 1 : 0;

  // Upsert user (Pre-invite mechanism!)
  const existing = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .bind(email)
    .first<User>();

  let userId: number;
  if (existing) {
    const isSuper = existing.is_super_admin || shouldBeSuper;
    await db.prepare(`
      UPDATE users
      SET google_sub = ?, name = COALESCE(?, name), avatar_url = ?, is_super_admin = ?, last_login_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(googleUser.sub || null, googleUser.name || null, googleUser.picture || null, isSuper, existing.id).run();
    userId = existing.id;
  } else {
    const res = await db.prepare(`
      INSERT INTO users (email, name, google_sub, avatar_url, is_super_admin, is_active, last_login_at)
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).bind(email, googleUser.name || null, googleUser.sub || null, googleUser.picture || null, shouldBeSuper).run();
    userId = Number(res.meta.last_row_id);
  }

  // Create session
  const session: SessionData = {
    uid: userId,
    email,
    name: googleUser.name,
    is_super_admin: shouldBeSuper === 1 || (existing?.is_super_admin === 1),
    exp: Date.now() + 7 * 86400 * 1000
  };

  const sessionToken = await signSession(session, c.env.SESSION_SECRET);
  setSessionCookie(c, sessionToken, isProd, baseDomain);

  return c.redirect(nextUrl);
});

// 3. Logout
authRoutes.post('/logout', async (c) => {
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isProd = c.req.url.startsWith('https://');
  clearSessionCookie(c, isProd, baseDomain);
  return c.redirect('/');
});

// 4. Dev Login Bypass (Strictly restricted to localhost / 127.0.0.1)
function isLocalDevRequest(urlStr: string, devBypassEnv?: string): boolean {
  if (devBypassEnv === 'false') {
    // Allow localhost even if wrangler.toml has DEV_BYPASS_AUTH = "false" ONLY when running on localhost
  }
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

authRoutes.get('/dev', async (c) => {
  if (!isLocalDevRequest(c.req.url, c.env.DEV_BYPASS_AUTH)) {
    return c.text('Not Found', 404);
  }

  const users = await c.env.DB.prepare('SELECT * FROM users ORDER BY is_super_admin DESC, email ASC').all<User>();
  const userOptions = users.results.map(u => `
    <option value="${u.id}">${escapeHtml(u.email)} ${u.is_super_admin ? '[SUPER ADMIN]' : ''}</option>
  `).join('');

  return c.html(renderLayout({
    title: 'Mode Dev Login',
    user: null,
    baseDomain: c.env.BASE_DOMAIN || 'gajiku.my.id',
    flashMessage: consumeFlash(c),
    content: `
      <div class="form-panel" style="max-width: 500px; margin: 40px auto;">
        <h3 class="form-title">Dev Bypass Login (Testing Lokal)</h3>
        <p style="font-size: 12px; color: var(--ink-muted); margin-bottom: 12px;">
          Fitur ini aktif hanya pada mode development untuk menguji coba hak akses akun tanpa harus redirect Google.
        </p>
        <form method="POST" action="/auth/dev">
          <div class="form-group">
            <label>Pilih Akun yang Tersedia di Database:</label>
            <select name="user_id" class="form-control" required>
              ${userOptions}
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Masuk Sesi Dev &rarr;</button>
        </form>
      </div>
    `
  }));
});

authRoutes.post('/dev', async (c) => {
  if (!isLocalDevRequest(c.req.url, c.env.DEV_BYPASS_AUTH)) {
    return c.text('Not Found', 404);
  }

  const body = await c.req.parseBody();
  const userId = parseInt(String(body.user_id), 10);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>();

  if (!user) {
    return redirectWithFlash(c, '/auth/dev', 'error', 'Akun pengguna tidak ditemukan.');
  }

  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isProd = c.req.url.startsWith('https://');

  const session: SessionData = {
    uid: user.id,
    email: user.email,
    name: user.name || undefined,
    is_super_admin: user.is_super_admin === 1,
    exp: Date.now() + 7 * 86400 * 1000
  };

  const token = await signSession(session, c.env.SESSION_SECRET);
  setSessionCookie(c, token, isProd, baseDomain);

  return c.redirect('/');
});
