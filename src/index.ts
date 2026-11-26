import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import type { Env, Organization } from './types';
import { authRoutes } from './routes/auth';
import { superAdminRoutes } from './routes/super-admin';
import { orgAdminRoutes } from './routes/org-admin';
import { publicRoutes } from './routes/public';
import { renderLayout } from './views/layout';
import { redirectWithFlash } from './lib/flash';

const app = new Hono<{ Bindings: Env }>();

const csrfMiddleware = csrf({
  origin: (origin, c) => {
    const baseDomain = (c.env.BASE_DOMAIN || 'gajiku.my.id').toLowerCase();
    try {
      const u = new URL(origin);
      const h = u.hostname.toLowerCase();
      if (h === baseDomain || (h.endsWith('.' + baseDomain) && !h.slice(0, -(baseDomain.length + 1)).includes('.'))) {
        return u.protocol === 'https:';
      }
      if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
});

// 0. Anti-CSRF Protection (Origin & Sec-Fetch-Site validation on state-changing requests)
app.use('*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const secFetchSite = c.req.header('Sec-Fetch-Site');
    if (secFetchSite === 'cross-site') {
      const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
      return c.html(renderLayout({
        title: 'Permintaan Ditolak (CSRF)',
        user: null,
        baseDomain,
        flashMessage: { type: 'error', text: 'Permintaan lintas-situs ditolak demi keamanan (CSRF).' },
        content: `<a href="/" class="btn">&larr; Kembali ke Beranda</a>`
      }), 403);
    }
  }
  await csrfMiddleware(c, next);
  if (c.res.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const referer = c.req.header('Referer');
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const reqUrl = new URL(c.req.url);
        if (refUrl.origin === reqUrl.origin) {
          c.res = redirectWithFlash(c, referer, 'error', 'Validasi keamanan (CSRF) gagal. Silakan muat ulang halaman dan coba lagi.');
          return;
        }
      } catch {
        // Ignore invalid referer
      }
    }
  }
});

// 1. Global Error Handler & 404 Handler
app.onError((err, c) => {
  console.error('Unhandled Server Error:', err);
  const method = c.req.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const referer = c.req.header('Referer') || '/';
    return redirectWithFlash(c, referer, 'error', err.message || 'Terjadi kesalahan pada server saat memproses data.');
  }
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  return c.html(renderLayout({
    title: 'Terjadi Kesalahan Sistem',
    user: null,
    baseDomain,
    flashMessage: { type: 'error', text: err.message || 'Kesalahan tak terduga pada server worker.' },
    content: `<a href="/" class="btn">&larr; Kembali ke Beranda</a>`
  }), 500);
});

app.notFound((c) => {
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  return c.html(renderLayout({
    title: '404 Halaman Tidak Ditemukan',
    user: null,
    baseDomain,
    flashMessage: { type: 'warn', text: 'Halaman yang Anda cari tidak ditemukan.' },
    content: `<a href="/" class="btn">&larr; Kembali ke Beranda</a>`
  }), 404);
});

// 2. Tenant Resolution Middleware (for apex and subdomains)
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const host = url.hostname.toLowerCase();
  const baseDomain = (c.env.BASE_DOMAIN || 'gajiku.my.id').toLowerCase();

  // Redirect www to apex
  if (host === `www.${baseDomain}`) {
    return c.redirect(`https://${baseDomain}${url.pathname}${url.search}`, 301);
  }

  // Check if Subdomain Mode
  let subdomain: string | null = null;
  if (host.endsWith(`.${baseDomain}`)) {
    subdomain = host.slice(0, -(baseDomain.length + 1));
  } else if (host.endsWith('.localhost')) {
    subdomain = host.slice(0, -('.localhost'.length));
  }

  if (subdomain) {
    // Universal SSL only covers 1 level
    if (subdomain.includes('.')) {
      return c.html(renderLayout({
        title: '404 Subdomain Tidak Valid',
        user: null,
        baseDomain,
        content: `<div class="alert alert-error">Tingkat subdomain melebihi batas 1 tingkat (*.${baseDomain}).</div><a href="https://${baseDomain}" class="btn">&larr; Beranda Utama</a>`
      }), 404);
    }

    // Lookup organization by subdomain
    const org = await c.env.DB.prepare('SELECT * FROM organizations WHERE subdomain = ? AND is_archived = 0')
      .bind(subdomain)
      .first<Organization>();

    if (!org) {
      // Check subdomain_aliases for 301 redirect from old subdomain (REV-015)
      try {
        const aliasOrg = await c.env.DB.prepare(`
          SELECT o.subdomain FROM subdomain_aliases a
          JOIN organizations o ON o.id = a.org_id
          WHERE a.old_subdomain = ? AND o.is_archived = 0
        `).bind(subdomain).first<{ subdomain: string }>();
        if (aliasOrg) {
          const proto = url.protocol === 'http:' ? 'http:' : 'https:';
          return c.redirect(`${proto}//${aliasOrg.subdomain}.${baseDomain}${url.pathname}${url.search}`, 301);
        }
      } catch {
        // Table may not exist yet in older DBs
      }

      return c.html(renderLayout({
        title: '404 Organisasi Tidak Ditemukan',
        user: null,
        baseDomain,
        content: `
          <div class="alert alert-warn">
            <strong>Organisasi Tidak Ditemukan:</strong> Subdomain <strong>${subdomain}.${baseDomain}</strong> tidak terdaftar atau telah diarsipkan.
          </div>
          <a href="https://${baseDomain}" class="btn">&larr; Kembali ke Direktori Utama</a>
        `
      }), 404);
    }

    // Redirect /super-admin on subdomain to apex
    if (url.pathname.startsWith('/super-admin')) {
      return c.redirect(`https://${baseDomain}/super-admin`);
    }

    c.set('org' as never, org as never);
    c.set('isSubdomainHost' as never, true as never);
  }

  await next();
});

// Mount Global System Routes
app.route('/auth', authRoutes);
app.route('/super-admin', superAdminRoutes);

// Path-based mode /org/:slug/* (For local dev and backward compatibility)
const orgSubApp = new Hono<{ Bindings: Env }>();
orgSubApp.use('*', async (c, next) => {
  const slug = c.req.param('slug')?.toLowerCase();
  const db = c.env.DB;
  const baseDomain = (c.env.BASE_DOMAIN || 'gajiku.my.id').toLowerCase();
  const url = new URL(c.req.url);

  if (!slug) return next();

  const org = await db.prepare('SELECT * FROM organizations WHERE (slug = ? OR subdomain = ?) AND is_archived = 0')
    .bind(slug, slug)
    .first<Organization>();

  if (!org) {
    return c.html(renderLayout({
      title: '404 Organisasi Tidak Ditemukan',
      user: null,
      baseDomain,
      content: `<div class="alert alert-error">Organisasi '${slug}' tidak ditemukan.</div><a href="/" class="btn">&larr; Kembali</a>`
    }), 404);
  }

  // Backward-compatibility redirect on apex domain in production:
  // e.g. https://gajiku.my.id/org/asprak-fte-telu/gaji -> https://asprak-fte-telu.gajiku.my.id/gaji
  if (url.hostname.toLowerCase() === baseDomain && url.protocol === 'https:') {
    const subPath = url.pathname.replace(`/org/${slug}`, '') || '/';
    return c.redirect(`https://${org.subdomain}.${baseDomain}${subPath}${url.search}`, 302);
  }

  c.set('org' as never, org as never);
  c.set('isSubdomainHost' as never, false as never);
  await next();
});

orgSubApp.route('/admin', orgAdminRoutes);
orgSubApp.route('/', publicRoutes);

app.route('/org/:slug', orgSubApp);

// Mount Subdomain & Apex Handlers directly
app.route('/admin', orgAdminRoutes);
app.route('/', publicRoutes);

export default app;
