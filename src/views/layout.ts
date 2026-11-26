import { escapeHtml } from '../lib/format';
import type { User, Organization, OrgRole } from '../types';

export interface LayoutOptions {
  title: string;
  user: (User & { memberships: Record<number, OrgRole> }) | null;
  org?: Organization | null;
  currentRole?: OrgRole | null;
  baseDomain: string;
  isSubdomainHost?: boolean;
  activeTab?: string;
  adminSubTab?: 'overview' | 'kas' | 'gaji' | 'classes' | 'periods' | 'settings';
  content: string;
  flashMessage?: { type: 'success' | 'error' | 'warn'; text: string } | null;
}

export function renderLayout(opts: LayoutOptions): string {
  const { title, user, org, currentRole, baseDomain, isSubdomainHost, activeTab, adminSubTab, content, flashMessage } = opts;

  const apexUrl = `https://${baseDomain}/`;
  const orgPrefix = org ? (isSubdomainHost ? '' : `/org/${org.slug}`) : '';
  const canAccessAdmin = Boolean(
    org && user && (user.is_super_admin || currentRole === 'org_admin' || currentRole === 'treasurer' || currentRole === 'auditor')
  );
  const canAccessSettings = Boolean(org && user && (user.is_super_admin || currentRole === 'org_admin'));

  // Build Sidebar Header
  const themeToggleBtn = `<button type="button" class="theme-toggle no-print" onclick="toggleTheme()" aria-label="Ganti Tema Terang/Gelap" title="Ganti Tema"><span class="theme-icon" aria-hidden="true">&#9790;</span></button>`;

  const sidebarHeaderHtml = org ? `
    <div class="sidebar-brand">
      <div class="sidebar-brand-row">
        <div class="sidebar-org-name">${escapeHtml(org.name)}</div>
        ${themeToggleBtn}
      </div>
      <div class="sidebar-sub-badge mono">${escapeHtml(org.subdomain)}.${escapeHtml(baseDomain)}</div>
      <a href="${apexUrl}" class="sidebar-back-link">&larr; Direktori Utama</a>
    </div>
  ` : `
    <div class="sidebar-brand">
      <div class="sidebar-brand-row">
        <div class="sidebar-org-name">Kas Terbuka Ormawa</div>
        ${themeToggleBtn}
      </div>
      <div class="sidebar-sub-badge mono">${escapeHtml(baseDomain)}</div>
    </div>
  `;

  // Build Sidebar Public Nav
  const publicNavHtml = org ? `
    <div class="sidebar-section">
      <div class="sidebar-section-title">Transparansi Publik</div>
      <a href="${orgPrefix}/" class="sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}">Ringkasan</a>
      <a href="${orgPrefix}/gaji" class="sidebar-link ${activeTab === 'gaji' ? 'active' : ''}">Honorarium &amp; Gaji</a>
      <a href="${orgPrefix}/kas" class="sidebar-link ${activeTab === 'kas' ? 'active' : ''}">Buku Kas &amp; Bukti</a>
      <a href="${orgPrefix}/audit" class="sidebar-link ${activeTab === 'audit' ? 'active' : ''}">Log Audit</a>
      <a href="${orgPrefix}/saran" class="sidebar-link ${activeTab === 'saran' ? 'active' : ''}">Kritik &amp; Saran</a>
    </div>
  ` : `
    <div class="sidebar-section">
      <div class="sidebar-section-title">Portal Publik</div>
      <a href="/" class="sidebar-link ${activeTab === 'home' ? 'active' : ''}">Direktori Organisasi</a>
    </div>
  `;

  // Build Sidebar Admin Nav
  const adminNavHtml = canAccessAdmin ? `
    <div class="sidebar-section">
      <div class="sidebar-section-title">Panel Pengelola</div>
      <a href="${orgPrefix}/admin" class="sidebar-link ${activeTab === 'admin' && (!adminSubTab || adminSubTab === 'overview') ? 'active' : ''}">Ringkasan Tugas</a>
      <a href="${orgPrefix}/admin/kas" class="sidebar-link ${activeTab === 'admin' && adminSubTab === 'kas' ? 'active' : ''}">Kas &amp; Bukti</a>
      <a href="${orgPrefix}/admin/gaji" class="sidebar-link ${activeTab === 'admin' && adminSubTab === 'gaji' ? 'active' : ''}">Input &amp; Import Gaji</a>
      <a href="${orgPrefix}/admin/classes" class="sidebar-link ${activeTab === 'admin' && adminSubTab === 'classes' ? 'active' : ''}">Kelas &amp; Prodi</a>
      <a href="${orgPrefix}/admin/periods" class="sidebar-link ${activeTab === 'admin' && adminSubTab === 'periods' ? 'active' : ''}">Periode</a>
      ${canAccessSettings ? `
        <a href="${orgPrefix}/admin/settings" class="sidebar-link ${activeTab === 'admin' && adminSubTab === 'settings' ? 'active' : ''}">Pengaturan &amp; Akun</a>
      ` : ''}
    </div>
  ` : '';

  // Super Admin Link
  const superAdminNavHtml = user?.is_super_admin ? `
    <div class="sidebar-section">
      <div class="sidebar-section-title">Sistem Global</div>
      <a href="${org ? apexUrl + 'super-admin' : '/super-admin'}" class="sidebar-link sidebar-link-super ${activeTab === 'super-admin' ? 'active' : ''}">Pusat Kendali Super Admin</a>
    </div>
  ` : '';

  // Sidebar Auth — shown at TOP of sidebar (right under brand header)
  const loginNext = org ? (isSubdomainHost ? '/' : `/org/${org.slug}`) : '/';
  const sidebarAuthHtml = !user ? `
    <div class="sidebar-auth-top">
      <a href="/auth/google?next=${encodeURIComponent(loginNext)}" class="btn btn-login-cta" aria-label="Masuk dengan Google">
        [ Masuk dengan Google ]
      </a>
    </div>
  ` : '';

  // Sidebar Footer — user info + logout (only shown when logged in)
  const sidebarFooterHtml = user ? `
    <div class="sidebar-footer">
      <div class="sidebar-user-email">${escapeHtml(user.email)}</div>
      <div class="sidebar-user-role">
        ${currentRole ? `<span class="badge badge-muted">${escapeHtml(currentRole)}</span>` : ''}
        ${user.is_super_admin ? `<span class="badge badge-danger">super_admin</span>` : ''}
      </div>
      <form action="/auth/logout" method="POST" style="margin-top: 8px;">
        <button type="submit" class="btn btn-sm" style="width: 100%; text-align: center; min-height: 44px; font-size: 14px; margin-top: 8px;">[ Keluar ]</button>
      </form>
    </div>
  ` : '';

  let flashHtml = '';
  if (flashMessage) {
    const cls = flashMessage.type === 'error' ? 'toast-error' : (flashMessage.type === 'warn' ? 'toast-warn' : 'toast-success');
    const tag = flashMessage.type === 'error' ? '[GALAT]' : (flashMessage.type === 'warn' ? '[PERINGATAN]' : '[BERHASIL]');
    flashHtml = `
      <div class="toast ${cls}" role="alert" aria-live="assertive">
        <div class="toast-body">
          <strong class="mono">${tag}</strong>
          <span>${escapeHtml(flashMessage.text)}</span>
        </div>
        <button type="button" class="toast-close" onclick="dismissToast(this.parentElement)" aria-label="Tutup notifikasi">&times;</button>
      </div>
    `;
  }

  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const printSignOffHtml = org ? `
    <div class="print-only print-signoff">
      <div class="print-meta">
        <div>Dicetak dari Portal Transparansi: <strong>${escapeHtml(org.subdomain)}.${escapeHtml(baseDomain)}</strong></div>
        <div>Tanggal Cetak: ${escapeHtml(printDateStr)}</div>
      </div>
      <div class="print-signatures">
        <div class="sig-box">
          <div class="sig-title">Mengetahui,<br>Ketua Organisasi</div>
          <div class="sig-line"></div>
          <div class="sig-name">( ________________________ )</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Disusun Oleh,<br>Bendahara Organisasi</div>
          <div class="sig-line"></div>
          <div class="sig-name">( ________________________ )</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Diperiksa Oleh,<br>Auditor Internal / DPM</div>
          <div class="sig-line"></div>
          <div class="sig-name">( ________________________ )</div>
        </div>
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Kas Terbuka Ormawa</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    (function() {
      try {
        var m = document.cookie.match(/(?:^|; )kas_theme=([^;]+)/);
        var saved = m ? decodeURIComponent(m[1]) : localStorage.getItem('kas_theme');
        if (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          saved = 'dark';
        }
        if (saved === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch (e) {}
    })();
  </script>
  <style>
    :root {
      --bg-paper: #F6F5F0;
      --bg-surface: #FFFFFF;
      --bg-header: #ECEAE2;
      --ink-primary: #1A1A1A;
      --ink-muted: #57534E;
      --border-strong: #1C1917;
      --border-grid: #D6D3CD;
      --ink-income: #166534;
      --bg-income: #ECFDF5;
      --ink-expense: #991B1B;
      --bg-expense: #FEF2F2;
      --ink-warn: #92400E;
      --bg-warn: #FEF3C7;
      --link-color: #1D4ED8;
    }

    [data-theme="dark"] {
      --bg-paper: #121210;
      --bg-surface: #1B1B18;
      --bg-header: #252520;
      --ink-primary: #F0EFEA;
      --ink-muted: #A8A29E;
      --border-strong: #D6D3CD;
      --border-grid: #383630;
      --ink-income: #4ADE80;
      --bg-income: #0F291A;
      --ink-expense: #F87171;
      --bg-expense: #2D1515;
      --ink-warn: #FBBF24;
      --bg-warn: #2C210C;
      --link-color: #60A5FA;
    }

    [data-theme="dark"] a:hover {
      color: #93C5FD;
    }
    [data-theme="dark"] .btn:hover {
      background-color: #32312B;
    }
    [data-theme="dark"] .btn-primary {
      background-color: #F0EFEA;
      color: #121210;
    }
    [data-theme="dark"] .btn-primary:hover {
      background-color: #D6D3CD;
    }
    [data-theme="dark"] th {
      background-color: var(--bg-header) !important;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-paper);
      color: var(--ink-primary);
      font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .mono, code, pre, .number, td.num, th.num, .tabular {
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    a {
      color: var(--link-color);
      text-decoration: underline;
    }
    a:hover {
      color: #1e3a8a;
    }

    /* Two-column Minimalist Sidebar Layout (REV-023) */
    .app-shell {
      display: flex;
      min-height: 100vh;
    }

    .app-sidebar {
      width: 248px;
      flex-shrink: 0;
      background-color: var(--bg-surface);
      border-right: 2px solid var(--border-strong);
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 40;
    }

    .sidebar-brand {
      padding: 16px;
      border-bottom: 2px solid var(--border-strong);
      background-color: var(--bg-header);
    }

    .sidebar-brand-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .theme-toggle {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      color: var(--ink-primary);
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      padding: 0;
    }
    .theme-toggle:hover {
      background: var(--bg-paper);
    }

    .sidebar-org-name {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.3;
      color: var(--ink-primary);
      margin-bottom: 4px;
    }

    .sidebar-sub-badge {
      font-size: 12px;
      color: var(--ink-muted);
      word-break: break-all;
    }

    .sidebar-back-link {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
    }
    .sidebar-back-link:hover {
      text-decoration: underline;
    }

    .sidebar-section {
      padding: 12px 0 8px;
      border-bottom: 1px solid var(--border-grid);
    }

    .sidebar-section-title {
      padding: 0 16px 6px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ink-muted);
    }

    .sidebar-link {
      display: block;
      padding: 7px 16px;
      color: var(--ink-primary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      border-left: 3px solid transparent;
    }

    .sidebar-link:hover {
      background-color: var(--bg-paper);
      text-decoration: none;
    }

    .sidebar-link.active {
      background-color: var(--bg-header);
      font-weight: 700;
      border-left-color: var(--border-strong);
    }

    .sidebar-link-super {
      color: var(--ink-expense);
      font-weight: 600;
    }

    .sidebar-auth-top {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-grid);
      background-color: var(--bg-paper);
    }

    .sidebar-footer {
      margin-top: auto;
      padding: 14px 16px;
      border-top: 1px solid var(--border-grid);
      background-color: var(--bg-paper);
    }

    .sidebar-user-email {
      font-size: 12px;
      font-weight: 600;
      word-break: break-all;
      margin-bottom: 4px;
    }

    .sidebar-user-role {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .app-main {
      flex: 1;
      min-width: 0;
      padding: 20px 28px 48px;
      max-width: 1180px;
    }

    .mobile-topbar {
      display: none;
    }

    .sidebar-backdrop {
      display: none;
    }

    header.app-header {
      padding: 0 0 14px;
      border-bottom: 2px solid var(--border-strong);
      margin-bottom: 18px;
    }

    .site-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.4px;
      color: var(--ink-primary);
      margin-bottom: 2px;
    }

    .site-subtitle {
      font-size: 13px;
      color: var(--ink-muted);
    }

    .link-btn {
      background: none;
      border: none;
      color: var(--ink-expense);
      text-decoration: underline;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
    }
    .link-btn:hover {
      color: #7f1d1d;
    }

    .alert {
      padding: 10px 14px;
      margin-bottom: 16px;
      border: 1px solid var(--border-strong);
      border-radius: 0;
      font-size: 13px;
    }
    .alert-success {
      background-color: var(--bg-income);
      color: var(--ink-income);
      border-color: var(--ink-income);
    }
    .alert-error {
      background-color: var(--bg-expense);
      color: var(--ink-expense);
      border-color: var(--ink-expense);
    }
    .alert-warn {
      background-color: var(--bg-warn);
      color: var(--ink-warn);
      border-color: var(--ink-warn);
    }

    /* Floating Toast Notifications */
    .toast-container {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 420px;
      width: calc(100vw - 36px);
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border: 2px solid var(--border-strong);
      background-color: var(--bg-surface);
      box-shadow: 4px 4px 0 rgba(28, 25, 23, 0.18);
      font-size: 13px;
      line-height: 1.45;
      animation: toastSlideIn 0.2s ease-out;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .toast-success {
      background-color: var(--bg-income);
      color: var(--ink-income);
      border-color: var(--ink-income);
    }

    .toast-error {
      background-color: var(--bg-expense);
      color: var(--ink-expense);
      border-color: var(--ink-expense);
    }

    .toast-warn {
      background-color: var(--bg-warn);
      color: var(--ink-warn);
      border-color: var(--ink-warn);
    }

    .toast-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .toast-close {
      background: none;
      border: none;
      color: inherit;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
      font-weight: 700;
    }

    .toast.toast-hiding {
      opacity: 0;
      transform: translateY(-6px);
    }

    @keyframes toastSlideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Financial Strip / Stat Cards */
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }

    .stat-box {
      background-color: var(--bg-surface);
      border: 1px solid var(--border-strong);
      padding: 12px 14px;
    }
    .stat-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--ink-muted);
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 700;
      font-family: 'IBM Plex Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
    .stat-value.income { color: var(--ink-income); }
    .stat-value.expense { color: var(--ink-expense); }
    .stat-value.balance { color: var(--ink-primary); }

    /* Tables & Sticky Columns (REV-020) */
    .table-wrap {
      overflow: auto;
      max-height: 75vh;
      border: 1px solid var(--border-strong);
      background-color: var(--bg-surface);
      margin-bottom: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    th, td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-grid);
      border-right: 1px solid var(--border-grid);
    }
    th:last-child, td:last-child {
      border-right: none;
    }

    th {
      background-color: var(--bg-header);
      color: var(--ink-primary);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.4px;
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .sticky-col {
      position: sticky;
      left: 0;
      z-index: 2;
      background-color: var(--bg-surface);
      border-right: 2px solid var(--border-grid);
    }
    th.sticky-col {
      background-color: var(--bg-header);
      z-index: 4;
    }
    tr.total-row td.sticky-col {
      background-color: var(--bg-header);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr.total-row {
      font-weight: 700;
      background-color: var(--bg-header);
      border-top: 2px solid var(--border-strong);
      border-bottom: 2px solid var(--border-strong);
    }

    td.num, th.num {
      text-align: right;
    }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 12px;
      font-family: 'IBM Plex Mono', monospace;
      font-weight: 500;
      border: 1px solid var(--border-strong);
      white-space: nowrap;
    }
    .badge-success { background: var(--bg-income); color: var(--ink-income); border-color: var(--ink-income); }
    .badge-danger { background: var(--bg-expense); color: var(--ink-expense); border-color: var(--ink-expense); }
    .badge-warn { background: var(--bg-warn); color: var(--ink-warn); border-color: var(--ink-warn); }
    .badge-muted { background: var(--bg-header); color: var(--ink-muted); }

    /* Forms */
    .form-panel {
      background-color: var(--bg-surface);
      border: 1px solid var(--border-strong);
      padding: 16px;
      margin-bottom: 20px;
    }
    .form-title {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--border-grid);
      padding-bottom: 6px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .form-group {
      margin-bottom: 12px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--ink-primary);
    }
    .form-control {
      width: 100%;
      padding: 6px 8px;
      font-family: inherit;
      font-size: 13px;
      color: var(--ink-primary);
      background-color: var(--bg-surface);
      border: 1px solid var(--border-strong);
      border-radius: 0;
    }
    .form-control:focus {
      outline: 2px solid var(--border-strong);
      outline-offset: -1px;
    }
    textarea.form-control {
      font-family: 'IBM Plex Mono', monospace;
      resize: vertical;
    }
    .btn {
      display: inline-block;
      padding: 6px 14px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-primary);
      background-color: var(--bg-header);
      border: 1px solid var(--border-strong);
      cursor: pointer;
      text-decoration: none;
      border-radius: 0;
    }
    .btn:hover {
      background-color: #dedbd0;
    }
    .btn-primary {
      background-color: var(--border-strong);
      color: #ffffff;
    }
    .btn-primary:hover {
      background-color: #333333;
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }
    .btn-login-cta {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 10px 14px;
      margin-top: 0;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      color: var(--ink-primary);
      background-color: var(--bg-header);
      border: 1px solid var(--border-strong);
      border-radius: 0;
      text-decoration: none;
      cursor: pointer;
      text-align: center;
      letter-spacing: 0;
      min-height: 48px;
      box-sizing: border-box;
    }
    .btn-login-cta:hover, .btn-login-cta:focus {
      background-color: #dedbd0;
      text-decoration: none;
      color: var(--ink-primary);
    }
    [data-theme="dark"] .btn-login-cta {
      background-color: var(--bg-header);
      color: var(--ink-primary);
      border-color: var(--border-strong);
    }
    [data-theme="dark"] .btn-login-cta:hover {
      background-color: var(--bg-paper);
      color: var(--ink-primary);
    }

    .empty-state {
      padding: 28px 16px;
      text-align: center;
      color: var(--ink-muted);
      background-color: var(--bg-surface);
    }
    .empty-state-icon {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 6px;
      color: var(--ink-muted);
    }
    .empty-state-text {
      font-size: 13px;
    }
    .empty-state-cta {
      margin-top: 10px;
    }

    /* Mobile Drawer Responsive (< 768px) */
    @media (max-width: 767px) {
      .app-shell {
        flex-direction: column;
      }

      .mobile-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        background-color: var(--bg-surface);
        border-bottom: 2px solid var(--border-strong);
        position: sticky;
        top: 0;
        z-index: 30;
      }

      .mobile-menu-btn {
        background: var(--bg-header);
        border: 1px solid var(--border-strong);
        padding: 5px 10px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        color: var(--ink-primary);
      }

      .mobile-login-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 5px 10px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        color: var(--ink-primary);
        background-color: var(--bg-header);
        border: 1px solid var(--border-strong);
        text-decoration: none;
        white-space: nowrap;
        min-height: 38px;
        margin-left: auto;
        flex-shrink: 0;
        cursor: pointer;
      }
      .mobile-login-btn:hover {
        background-color: #dedbd0;
        color: var(--ink-primary);
        text-decoration: none;
      }
      [data-theme="dark"] .mobile-login-btn {
        background-color: var(--bg-header);
        border-color: var(--border-strong);
        color: var(--ink-primary);
      }

      .mobile-title {
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .app-sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        transform: translateX(-100%);
        transition: transform 0.2s ease;
        z-index: 50;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        height: 100%;
      }

      .app-sidebar.sidebar-open {
        transform: translateX(0);
      }

      .sidebar-backdrop.sidebar-open {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 45;
      }

      .app-main {
        padding: 14px 14px 40px;
      }
    }

    .print-only {
      display: none;
    }

    /* Print styles (REV-022) */
    @media print {
      body {
        background: #ffffff;
        color: #000000;
        font-size: 10pt;
      }
      .app-sidebar, .mobile-topbar, .sidebar-backdrop, .btn, .no-print, form, .sub-nav {
        display: none !important;
      }
      .app-shell {
        display: block;
      }
      .app-main {
        max-width: 100%;
        padding: 0;
        margin: 0;
      }
      .table-wrap {
        border: 1pt solid #000;
        overflow: visible;
      }
      th, td {
        border-color: #666;
        padding: 4pt 6pt;
      }
      th {
        background: #eee !important;
        -webkit-print-color-adjust: exact;
      }
      .stat-box {
        border: 1pt solid #000;
      }
      .print-only {
        display: block !important;
      }
      .print-signoff {
        margin-top: 28pt;
        page-break-inside: avoid;
      }
      .print-meta {
        display: flex;
        justify-content: space-between;
        font-size: 9pt;
        border-top: 1pt solid #000;
        padding-top: 6pt;
        margin-bottom: 18pt;
      }
      .print-signatures {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16pt;
        text-align: center;
        font-size: 9pt;
      }
      .sig-title {
        margin-bottom: 44pt;
        font-weight: 600;
      }
      .sig-name {
        font-family: 'IBM Plex Mono', monospace;
      }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <div class="mobile-topbar no-print">
      <button type="button" class="mobile-menu-btn" onclick="toggleSidebar()" aria-label="Buka Menu Navigasi">&#9776; Menu</button>
      <div class="mobile-title">${escapeHtml(org ? org.name : 'Kas Terbuka Ormawa')}</div>
      ${!user ? `<a href="/auth/google?next=${encodeURIComponent(org ? (isSubdomainHost ? '/' : `/org/${org.slug}`) : '/')}" class="mobile-login-btn" aria-label="Masuk">[ Masuk ]</a>` : ''}
      ${themeToggleBtn}
    </div>

    <div id="sidebar-backdrop" class="sidebar-backdrop" onclick="toggleSidebar()"></div>

    <aside id="app-sidebar" class="app-sidebar no-print" aria-label="Navigasi Utama">
      ${sidebarHeaderHtml}
      ${sidebarAuthHtml}
      ${publicNavHtml}
      ${adminNavHtml}
      ${superAdminNavHtml}
      ${sidebarFooterHtml}
    </aside>

    <div class="app-main">
      <header class="app-header">
        <h1 class="site-title">${escapeHtml(org ? org.name : 'Kas Terbuka Ormawa')}</h1>
        <p class="site-subtitle">${escapeHtml(org?.description || 'Portal Transparansi Dana, Penggajian Multi-Kelas, & Akuntabilitas Kas Organisasi Mahasiswa')}</p>
      </header>

      <main>
        ${content}
        ${printSignOffHtml}
      </main>

      <div id="toast-container" class="toast-container no-print">
        ${flashHtml}
      </div>

      <footer style="margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border-grid); font-size: 12px; color: var(--ink-muted); text-align: center;">
        Civic Integrity &amp; Transparency Initiative &bull; Telkom University, Bandung &bull;
        <a href="https://${escapeHtml(baseDomain)}">${escapeHtml(baseDomain)}</a>
      </footer>
    </div>
  </div>

  <script>
    function toggleSidebar() {
      var sb = document.getElementById('app-sidebar');
      var bd = document.getElementById('sidebar-backdrop');
      if (sb) sb.classList.toggle('sidebar-open');
      if (bd) bd.classList.toggle('sidebar-open');
    }

    function dismissToast(el) {
      if (!el) return;
      el.classList.add('toast-hiding');
      setTimeout(function() {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, 250);
    }

    function showToast(type, text) {
      var container = document.getElementById('toast-container');
      if (!container) return;
      var cls = type === 'error' ? 'toast-error' : (type === 'warn' ? 'toast-warn' : 'toast-success');
      var tag = type === 'error' ? '[GALAT]' : (type === 'warn' ? '[PERINGATAN]' : '[BERHASIL]');
      var toast = document.createElement('div');
      toast.className = 'toast ' + cls;
      toast.setAttribute('role', 'alert');
      var body = document.createElement('div');
      body.className = 'toast-body';
      var strong = document.createElement('strong');
      strong.className = 'mono';
      strong.textContent = tag;
      var span = document.createElement('span');
      span.textContent = text;
      body.appendChild(strong);
      body.appendChild(span);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-close';
      btn.setAttribute('aria-label', 'Tutup notifikasi');
      btn.innerHTML = '&times;';
      btn.onclick = function() { dismissToast(toast); };
      toast.appendChild(body);
      toast.appendChild(btn);
      container.appendChild(toast);
      setTimeout(function() { dismissToast(toast); }, 6000);
    }

    function syncThemeIcons(theme) {
      var icons = document.querySelectorAll('.theme-icon');
      icons.forEach(function(el) {
        el.innerHTML = theme === 'dark' ? '&#9728;' : '&#9790;';
      });
    }

    function toggleTheme() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = isDark ? 'light' : 'dark';
      if (next === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      try {
        localStorage.setItem('kas_theme', next);
        var host = window.location.hostname;
        var base = ${JSON.stringify(baseDomain)};
        var cookie = 'kas_theme=' + next + '; Path=/; Max-Age=31536000; SameSite=Lax';
        if (host === base || host.endsWith('.' + base)) {
          cookie += '; Domain=.' + base;
        }
        document.cookie = cookie;
      } catch (e) {}
      syncThemeIcons(next);
    }

    document.addEventListener('DOMContentLoaded', function() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      syncThemeIcons(isDark ? 'dark' : 'light');
      var toasts = document.querySelectorAll('#toast-container .toast');
      toasts.forEach(function(t) {
        setTimeout(function() { dismissToast(t); }, 6000);
      });
    });
  </script>
</body>
</html>`;
}
