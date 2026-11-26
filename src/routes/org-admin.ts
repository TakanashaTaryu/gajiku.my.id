import { Hono } from 'hono';
import type { Env, Organization, User, Period, OrgClass, PayrollEntry, CashTransaction, Feedback, OrgMembership, OrgRole } from '../types';
import { getCurrentUser } from '../lib/auth';
import { consumeFlash, redirectWithFlash } from '../lib/flash';
import { renderLayout } from '../views/layout';
import { renderOrgAdminPage } from '../views/org-admin';
import { calculateGrossPay, calculateKasDeduction, calculateNetPay } from '../services/payroll';
import { postPayrollToCashbook, cancelPayrollPosting } from '../services/cashbook';
import { parsePayrollCSV } from '../lib/csv';
import { logAudit } from '../lib/audit';
import { validateSubdomain, resolveUniqueSubdomain } from '../lib/subdomain';

import type { Context } from 'hono';

export const orgAdminRoutes = new Hono<{ Bindings: Env }>();

function adminUrl(c: Context<{ Bindings: Env }>, org: Organization, subPath: string): string {
  const prefix = c.get('isSubdomainHost' as never) ? '' : `/org/${org.slug}`;
  return `${prefix}/admin${subPath}`;
}

// Middleware: Require role in this organization
orgAdminRoutes.use('*', async (c, next) => {
  const org = c.get('org' as never) as unknown as Organization;
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  if (!org) {
    return c.html(renderLayout({
      title: '404 Organisasi Tidak Ditemukan',
      user: null,
      baseDomain,
      content: `<div class="alert alert-error">Organisasi tidak ditemukan dalam konteks permintaan.</div><a href="/" class="btn">&larr; Kembali ke Beranda</a>`
    }), 404);
  }

  const user = await getCurrentUser(c);

  if (!user) {
    const isSub = c.get('isSubdomainHost' as never) as boolean;
    const loginUrl = `/auth/google?next=${encodeURIComponent(c.req.url)}`;
    return c.redirect(loginUrl);
  }

  const role = user.memberships[org.id];
  const isSuper = user.is_super_admin === 1;

  if (!isSuper && (!role || !['org_admin', 'treasurer', 'auditor'].includes(role))) {
    return c.html(renderLayout({
      title: 'Akses Ditolak',
      user,
      org,
      baseDomain,
      content: `<div class="alert alert-error">Anda tidak memiliki hak akses pengelola (Bendahara / Auditor / Admin) pada organisasi ini.</div>`
    }), 403);
  }

  c.set('currentUser' as never, user as never);
  c.set('currentRole' as never, (role || (isSuper ? 'org_admin' : 'member')) as never);
  await next();
});

// Helper to fetch admin view data
async function fetchAdminViewData(c: Context<{ Bindings: Env }>, subTab: 'overview' | 'kas' | 'gaji' | 'classes' | 'periods' | 'settings') {
  const db = c.env.DB;
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as (User & { memberships: Record<number, OrgRole> });
  const currentRole = c.get('currentRole' as never) as unknown as OrgRole;
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isSubdomainHost = Boolean(c.get('isSubdomainHost' as never));

  const periodsRaw = await db.prepare('SELECT * FROM periods WHERE org_id = ? ORDER BY id DESC').bind(org.id).all<Period>();
  const periods = periodsRaw.results;

  const periodIdParam = c.req.query('period');
  let selectedPeriod: Period | null = null;
  if (periodIdParam) {
    selectedPeriod = periods.find((p: Period) => p.id === parseInt(periodIdParam, 10)) || null;
  }
  if (!selectedPeriod && periods.length > 0) {
    selectedPeriod = periods.find((p: Period) => p.status === 'open') || periods[0];
  }

  const classesRaw = await db.prepare('SELECT * FROM org_classes WHERE org_id = ? ORDER BY sort_order ASC, id ASC').bind(org.id).all<OrgClass>();
  const classes = classesRaw.results;

  let entries: PayrollEntry[] = [];
  if (selectedPeriod) {
    const entriesRaw = await db.prepare('SELECT * FROM payroll_entries WHERE org_id = ? AND period_id = ? ORDER BY id ASC')
      .bind(org.id, selectedPeriod.id)
      .all<PayrollEntry>();
    entries = entriesRaw.results;
  }

  const txRaw = await db.prepare('SELECT * FROM cash_transactions WHERE org_id = ? ORDER BY tx_date DESC, id DESC').bind(org.id).all<CashTransaction>();
  const transactions = txRaw.results;

  const fbRaw = await db.prepare('SELECT * FROM feedbacks WHERE org_id = ? ORDER BY id DESC').bind(org.id).all<Feedback>();
  const feedbacks = fbRaw.results;

  const memRaw = await db.prepare(`
    SELECT m.*, u.email AS user_email, u.name AS user_name
    FROM org_memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ?
    ORDER BY m.id ASC
  `).bind(org.id).all<OrgMembership & { user_email: string; user_name: string }>();
  const memberships = memRaw.results;

  return {
    org,
    currentRole,
    isSuperAdmin: user.is_super_admin === 1,
    subTab,
    periods,
    selectedPeriod,
    classes,
    entries,
    transactions,
    feedbacks,
    memberships,
    baseDomain,
    isSubdomainHost
  };
}

// 1. Overview
orgAdminRoutes.get('/', async (c) => {
  const data = await fetchAdminViewData(c, 'overview');
  const user = c.get('currentUser' as never) as unknown as (User & { memberships: Record<number, OrgRole> });
  return c.html(renderLayout({
    title: `Panel Pengelola — ${data.org.name}`,
    user,
    org: data.org,
    currentRole: data.currentRole,
    baseDomain: data.baseDomain,
    isSubdomainHost: data.isSubdomainHost,
    activeTab: 'admin',
    adminSubTab: data.subTab,
    flashMessage: consumeFlash(c),
    content: renderOrgAdminPage(data)
  }));
});

// 2. Kas & Bukti
orgAdminRoutes.get('/kas', async (c) => {
  const data = await fetchAdminViewData(c, 'kas');
  const user = c.get('currentUser' as never) as unknown as (User & { memberships: Record<number, OrgRole> });
  return c.html(renderLayout({
    title: `Kas & Bukti — ${data.org.name}`,
    user,
    org: data.org,
    currentRole: data.currentRole,
    baseDomain: data.baseDomain,
    isSubdomainHost: data.isSubdomainHost,
    activeTab: 'admin',
    adminSubTab: data.subTab,
    flashMessage: consumeFlash(c),
    content: renderOrgAdminPage(data)
  }));
});

orgAdminRoutes.post('/kas', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/kas');
  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki hak menambah nominal kas.');

  const db = c.env.DB;
  const body = await c.req.parseBody();

  const period_id = body.period_id ? (parseInt(String(body.period_id), 10) || null) : null;
  const tx_date = String(body.tx_date || new Date().toISOString().slice(0, 10));
  const type = body.type === 'income' ? 'income' : 'expense';
  const category = String(body.category || 'Lainnya');
  const description = String(body.description || '').trim();
  const amount = parseInt(String(body.amount), 10);
  const proof_url = String(body.proof_url || '').trim() || null;
  const proof_status = String(body.proof_status || 'belum_ada');

  if (!description || isNaN(amount) || amount <= 0) {
    return redirectWithFlash(c, backUrl, 'error', 'Data transaksi tidak valid: keterangan dan nominal (> 0) wajib diisi.');
  }

  // Validate URL protocol if provided
  if (proof_url && !proof_url.startsWith('https://') && !proof_url.startsWith('http://')) {
    return redirectWithFlash(c, backUrl, 'error', 'URL Bukti harus diawali dengan http:// atau https://');
  }

  const res = await db.prepare(`
    INSERT INTO cash_transactions (org_id, period_id, tx_date, type, category, description, amount, proof_status, proof_url, source_type, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
  `).bind(org.id, period_id, tx_date, type, category, description, amount, proof_status, proof_url, user.id).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'CREATE_TX',
    'transaction',
    Number(res.meta.last_row_id),
    `Mencatat transaksi kas ${type === 'income' ? 'Masuk' : 'Keluar'} Rp${amount.toLocaleString('id-ID')} (${description})`
  );

  return redirectWithFlash(c, backUrl, 'success', 'Transaksi kas berhasil disimpan.');
});

orgAdminRoutes.post('/kas/:id/proof', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/kas');
  const db = c.env.DB;
  const txId = parseInt(c.req.param('id'), 10);
  const body = await c.req.parseBody();

  const proof_status = String(body.proof_status || 'belum_ada');
  const proof_url = String(body.proof_url || '').trim() || null;

  if (proof_url && !proof_url.startsWith('https://') && !proof_url.startsWith('http://')) {
    return redirectWithFlash(c, backUrl, 'error', 'URL Bukti harus diawali dengan http:// atau https://');
  }

  const existingTx = await db.prepare('SELECT proof_status, proof_url FROM cash_transactions WHERE id = ? AND org_id = ?')
    .bind(txId, org.id)
    .first<{ proof_status: string; proof_url: string | null }>();

  await db.prepare(`
    UPDATE cash_transactions
    SET proof_status = ?, proof_url = ?, proof_verified_by = ?, proof_verified_at = CURRENT_TIMESTAMP
    WHERE id = ? AND org_id = ?
  `).bind(proof_status, proof_url, user.id, txId, org.id).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'UPDATE_PROOF',
    'transaction',
    txId,
    `Bukti transaksi #${txId}: status '${existingTx?.proof_status || '-'}' -> '${proof_status}' oleh ${role} (${user.email})`
  );

  return redirectWithFlash(c, backUrl, 'success', `Status bukti transaksi #${txId} berhasil diperbarui.`);
});

orgAdminRoutes.post('/kas/:id/delete', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/kas');
  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin menghapus transaksi.');

  const db = c.env.DB;
  const txId = parseInt(c.req.param('id'), 10);

  const tx = await db.prepare('SELECT * FROM cash_transactions WHERE id = ? AND org_id = ?').bind(txId, org.id).first<CashTransaction>();
  if (!tx) return redirectWithFlash(c, backUrl, 'error', 'Transaksi tidak ditemukan.');
  if (tx.source_type !== 'manual') {
    return redirectWithFlash(c, backUrl, 'error', 'Transaksi otomatis gaji tidak dapat dihapus manual dari sini. Gunakan menu Batal Post Gaji.');
  }

  await db.prepare('DELETE FROM cash_transactions WHERE id = ? AND org_id = ?').bind(txId, org.id).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'DELETE_TX',
    'transaction',
    txId,
    `Menghapus transaksi manual #${txId} (${tx.description} - Rp${tx.amount.toLocaleString('id-ID')})`
  );

  return redirectWithFlash(c, backUrl, 'success', 'Transaksi manual berhasil dihapus.');
});

// 3. Gaji
orgAdminRoutes.get('/gaji', async (c) => {
  const data = await fetchAdminViewData(c, 'gaji');
  const user = c.get('currentUser' as never) as unknown as (User & { memberships: Record<number, OrgRole> });
  return c.html(renderLayout({
    title: `Input & Import Gaji — ${data.org.name}`,
    user,
    org: data.org,
    currentRole: data.currentRole,
    baseDomain: data.baseDomain,
    isSubdomainHost: data.isSubdomainHost,
    activeTab: 'admin',
    adminSubTab: data.subTab,
    flashMessage: consumeFlash(c),
    content: renderOrgAdminPage(data)
  }));
});

orgAdminRoutes.post('/gaji/add', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const db = c.env.DB;
  const body = await c.req.parseBody();

  const periodId = parseInt(String(body.period_id), 10);
  const backUrl = adminUrl(c, org, `/gaji${!isNaN(periodId) ? `?period=${periodId}` : ''}`);
  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin mengubah data gaji.');

  const classId = parseInt(String(body.class_id), 10);
  const member_name = String(body.member_name || '').trim();
  const hours = parseFloat(String(body.hours || '0'));
  const kas_deduction_mode = body.kas_deduction_mode === 'manual' ? 'manual' : 'auto';
  const fine_amount = parseInt(String(body.fine_amount || '0'), 10) || 0;
  const fine_reason = String(body.fine_reason || '').trim() || null;

  if (fine_amount < 0) {
    return redirectWithFlash(c, backUrl, 'error', 'Nominal denda tidak boleh bernilai negatif.');
  }

  const period = await db.prepare('SELECT * FROM periods WHERE id = ? AND org_id = ?').bind(periodId, org.id).first<Period>();
  if (!period || period.status === 'locked') {
    return redirectWithFlash(c, backUrl, 'error', 'Periode tidak valid atau sudah dikunci (Tutup Buku).');
  }

  const cls = await db.prepare('SELECT * FROM org_classes WHERE id = ? AND org_id = ?').bind(classId, org.id).first<OrgClass>();
  if (!cls) return redirectWithFlash(c, backUrl, 'error', 'Kelas tidak ditemukan.');

  if (!member_name || isNaN(hours) || hours <= 0) {
    return redirectWithFlash(c, backUrl, 'error', 'Data nama anggota dan jam kerja (> 0) harus valid.');
  }

  const gross_pay = calculateGrossPay(hours, cls.hourly_rate);

  let kas_deduction = 0;
  if (kas_deduction_mode === 'manual') {
    kas_deduction = parseInt(String(body.manual_kas_deduction || '0'), 10) || 0;
    if (kas_deduction < 0) {
      return redirectWithFlash(c, backUrl, 'error', 'Potongan kas manual tidak boleh bernilai negatif.');
    }
  } else {
    kas_deduction = calculateKasDeduction(gross_pay, org.deduction_mode, org.deduction_value);
  }

  if (kas_deduction + fine_amount > gross_pay) {
    return redirectWithFlash(c, backUrl, 'error', 'Total potongan kas dan denda tidak boleh melebihi gaji bruto.');
  }

  const net_pay = calculateNetPay(gross_pay, kas_deduction, fine_amount);

  const res = await db.prepare(`
    INSERT INTO payroll_entries (
      org_id, period_id, class_id, class_code, merge_group, member_name,
      hours, hourly_rate, gross_pay, kas_deduction_mode, kas_deduction,
      fine_amount, fine_reason, net_pay, posted_to_kas, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).bind(
    org.id, period.id, cls.id, cls.code, cls.merge_group, member_name,
    hours, cls.hourly_rate, gross_pay, kas_deduction_mode, kas_deduction,
    fine_amount, fine_reason, net_pay, user.id
  ).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'ADD_PAYROLL_ENTRY',
    'payroll_entry',
    Number(res.meta.last_row_id),
    `Menambah entri gaji ${member_name} (${cls.code}: ${hours} jam, Bruto Rp${gross_pay.toLocaleString('id-ID')})`
  );

  return redirectWithFlash(c, backUrl, 'success', `Entri gaji untuk ${member_name} berhasil disimpan.`);
});

// Import Quick Paste TSV/CSV from Excel
orgAdminRoutes.post('/gaji/import', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const periodId = parseInt(String(body.period_id), 10);
  const csvData = String(body.csv_data || '');
  const backUrl = adminUrl(c, org, `/gaji${!isNaN(periodId) ? `?period=${periodId}` : ''}`);

  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin mengubah data gaji.');

  const period = await db.prepare('SELECT * FROM periods WHERE id = ? AND org_id = ?').bind(periodId, org.id).first<Period>();
  if (!period || period.status === 'locked') {
    return redirectWithFlash(c, backUrl, 'error', 'Periode tidak valid atau sudah dikunci (Tutup Buku).');
  }

  const { rows, errors } = parsePayrollCSV(csvData);
  if (errors.length > 0) {
    return redirectWithFlash(c, backUrl, 'error', `Gagal import: ${errors[0]}`);
  }

  // Load all active classes
  const classesRaw = await db.prepare('SELECT * FROM org_classes WHERE org_id = ? AND is_active = 1').bind(org.id).all<OrgClass>();
  const classMap = new Map<string, OrgClass>();
  for (const cItem of classesRaw.results) {
    classMap.set(cItem.code.toUpperCase(), cItem);
  }

  const statements: D1PreparedStatement[] = [];
  for (const r of rows) {
    const cls = classMap.get(r.class_code);
    if (!cls) {
      return redirectWithFlash(c, backUrl, 'error', `Kode kelas '${r.class_code}' tidak terdaftar pada organisasi ini. Daftarkan kelas terlebih dahulu di menu Kelas/Prodi.`);
    }

    const gross = calculateGrossPay(r.hours, cls.hourly_rate);
    const kasDed = calculateKasDeduction(gross, org.deduction_mode, org.deduction_value);
    const net = calculateNetPay(gross, kasDed, 0);

    statements.push(
      db.prepare(`
        INSERT INTO payroll_entries (
          org_id, period_id, class_id, class_code, merge_group, member_name,
          hours, hourly_rate, gross_pay, kas_deduction_mode, kas_deduction,
          fine_amount, fine_reason, net_pay, posted_to_kas, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, 0, NULL, ?, 0, ?)
      `).bind(
        org.id, period.id, cls.id, cls.code, cls.merge_group, r.member_name,
        r.hours, cls.hourly_rate, gross, kasDed, net, user.id
      )
    );
  }

  await db.batch(statements);

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'IMPORT_PAYROLL_CSV',
    'period',
    period.id,
    `Import cepat ${rows.length} entri honorarium ke ${period.name}`
  );

  return redirectWithFlash(c, backUrl, 'success', `Berhasil mengimpor ${rows.length} entri honorarium.`);
});

// 1-Click Post All Payroll to Cashbook
orgAdminRoutes.post('/gaji/post-all', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const periodId = parseInt(String(body.period_id), 10);
  const backUrl = adminUrl(c, org, `/gaji${!isNaN(periodId) ? `?period=${periodId}` : ''}`);

  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin memposting kas.');

  const period = await db.prepare('SELECT * FROM periods WHERE id = ? AND org_id = ?').bind(periodId, org.id).first<Period>();
  if (!period) return redirectWithFlash(c, backUrl, 'error', 'Periode tidak ditemukan.');

  const entriesRaw = await db.prepare('SELECT * FROM payroll_entries WHERE org_id = ? AND period_id = ?').bind(org.id, period.id).all<PayrollEntry>();

  const result = await postPayrollToCashbook(db, org, period, entriesRaw.results, user.id, user.email);
  if (result.error) {
    return redirectWithFlash(c, backUrl, 'error', result.error);
  }

  return redirectWithFlash(c, backUrl, 'success', `Berhasil memposting ${result.postedCount} entri gaji ke Buku Kas.`);
});

// Cancel payroll post
orgAdminRoutes.post('/gaji/:id/unpost', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const db = c.env.DB;
  const entryId = parseInt(c.req.param('id'), 10);
  const body = await c.req.parseBody();
  const periodId = parseInt(String(body.period_id), 10);
  const backUrl = adminUrl(c, org, `/gaji${!isNaN(periodId) ? `?period=${periodId}` : ''}`);

  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin membatalkan posting kas.');

  const result = await cancelPayrollPosting(db, org.id, periodId, entryId, user.id, user.email);
  if (!result.success) {
    return redirectWithFlash(c, backUrl, 'error', result.error || 'Gagal membatalkan posting.');
  }

  return redirectWithFlash(c, backUrl, 'success', 'Posting kas untuk entri gaji berhasil dibatalkan.');
});

// Delete payroll entry
orgAdminRoutes.post('/gaji/:id/delete', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const db = c.env.DB;
  const entryId = parseInt(c.req.param('id'), 10);
  const body = await c.req.parseBody();
  const periodId = parseInt(String(body.period_id), 10);
  const backUrl = adminUrl(c, org, `/gaji${!isNaN(periodId) ? `?period=${periodId}` : ''}`);

  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin menghapus entri gaji.');

  const entry = await db.prepare('SELECT * FROM payroll_entries WHERE id = ? AND org_id = ?').bind(entryId, org.id).first<PayrollEntry>();
  if (!entry) return redirectWithFlash(c, backUrl, 'error', 'Entri gaji tidak ditemukan.');
  if (entry.posted_to_kas) {
    return redirectWithFlash(c, backUrl, 'error', 'Entri yang sudah diposting ke kas tidak dapat langsung dihapus. Batalkan posting terlebih dahulu.');
  }

  await db.prepare('DELETE FROM payroll_entries WHERE id = ? AND org_id = ?').bind(entryId, org.id).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'DELETE_PAYROLL_ENTRY',
    'payroll_entry',
    entryId,
    `Menghapus entri gaji ${entry.member_name} (${entry.class_code})`
  );

  return redirectWithFlash(c, backUrl, 'success', `Entri gaji ${entry.member_name} berhasil dihapus.`);
});

// 4. Dynamic Classes
orgAdminRoutes.get('/classes', async (c) => {
  const data = await fetchAdminViewData(c, 'classes');
  const user = c.get('currentUser' as never) as unknown as (User & { memberships: Record<number, OrgRole> });
  return c.html(renderLayout({
    title: `Kelas & Prodi — ${data.org.name}`,
    user,
    org: data.org,
    currentRole: data.currentRole,
    baseDomain: data.baseDomain,
    isSubdomainHost: data.isSubdomainHost,
    activeTab: 'admin',
    adminSubTab: data.subTab,
    flashMessage: consumeFlash(c),
    content: renderOrgAdminPage(data)
  }));
});

orgAdminRoutes.post('/classes', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/classes');
  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin mengubah kelas.');

  const db = c.env.DB;
  const body = await c.req.parseBody();

  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  const hourly_rate = parseInt(String(body.hourly_rate || '0'), 10);
  const merge_group = String(body.merge_group || '').trim().toUpperCase() || null;

  if (!code || !name || isNaN(hourly_rate) || hourly_rate < 0) {
    return redirectWithFlash(c, backUrl, 'error', 'Kode, nama, dan tarif per jam (>= 0) harus valid.');
  }

  await db.prepare(`
    INSERT INTO org_classes (org_id, code, name, hourly_rate, merge_group)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(org_id, code) DO UPDATE SET name = excluded.name, hourly_rate = excluded.hourly_rate, merge_group = excluded.merge_group, is_active = 1
  `).bind(org.id, code, name, hourly_rate, merge_group).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'SAVE_CLASS',
    'class',
    code,
    `Menambah / memperbarui kelas '${code}' (${name}) dengan tarif Rp${hourly_rate.toLocaleString('id-ID')}`
  );

  return redirectWithFlash(c, backUrl, 'success', `Kelas '${code}' berhasil disimpan.`);
});

orgAdminRoutes.post('/classes/:id/delete', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/classes');
  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin mengubah kelas.');

  const db = c.env.DB;
  const classId = parseInt(c.req.param('id'), 10);

  const cls = await db.prepare('SELECT * FROM org_classes WHERE id = ? AND org_id = ?').bind(classId, org.id).first<OrgClass>();
  if (!cls) return redirectWithFlash(c, backUrl, 'error', 'Kelas tidak ditemukan.');

  // Check if class has been used in payroll_entries
  const usedCount = await db.prepare('SELECT COUNT(*) as count FROM payroll_entries WHERE class_id = ? OR class_code = ?')
    .bind(classId, cls.code)
    .first<{ count: number }>();

  if (usedCount && usedCount.count > 0) {
    // Soft delete to protect historical records
    await db.prepare('UPDATE org_classes SET is_active = 0 WHERE id = ?').bind(classId).run();
    await logAudit(
      db,
      org.id,
      user.id,
      user.email,
      'DEACTIVATE_CLASS',
      'class',
      classId,
      `Menonaktifkan kelas '${cls.code}' (sudah memiliki histori ${usedCount.count} entri gaji)`
    );
    return redirectWithFlash(c, backUrl, 'success', `Kelas '${cls.code}' dinonaktifkan (histori gaji tetap terjaga).`);
  } else {
    // Hard delete
    await db.prepare('DELETE FROM org_classes WHERE id = ?').bind(classId).run();
    await logAudit(
      db,
      org.id,
      user.id,
      user.email,
      'DELETE_CLASS',
      'class',
      classId,
      `Menghapus kelas '${cls.code}' secara permanen`
    );
    return redirectWithFlash(c, backUrl, 'success', `Kelas '${cls.code}' berhasil dihapus permanen.`);
  }
});

// 5. Periods
orgAdminRoutes.get('/periods', async (c) => {
  const data = await fetchAdminViewData(c, 'periods');
  const user = c.get('currentUser' as never) as unknown as (User & { memberships: Record<number, OrgRole> });
  return c.html(renderLayout({
    title: `Periode — ${data.org.name}`,
    user,
    org: data.org,
    currentRole: data.currentRole,
    baseDomain: data.baseDomain,
    isSubdomainHost: data.isSubdomainHost,
    activeTab: 'admin',
    adminSubTab: data.subTab,
    flashMessage: consumeFlash(c),
    content: renderOrgAdminPage(data)
  }));
});

orgAdminRoutes.post('/periods', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/periods');
  if (role === 'auditor') return redirectWithFlash(c, backUrl, 'error', 'Auditor tidak memiliki izin membuat periode.');

  const db = c.env.DB;
  const body = await c.req.parseBody();
  const name = String(body.name || '').trim();
  const start_date = String(body.start_date || '') || null;
  const end_date = String(body.end_date || '') || null;

  if (!name) return redirectWithFlash(c, backUrl, 'error', 'Nama periode wajib diisi.');

  // Check duplicate period name (REV-010)
  const existingPeriod = await db.prepare('SELECT id FROM periods WHERE org_id = ? AND LOWER(name) = LOWER(?)')
    .bind(org.id, name)
    .first<{ id: number }>();
  if (existingPeriod) {
    return redirectWithFlash(c, backUrl, 'error', `Periode dengan nama '${name}' sudah terdaftar pada organisasi ini.`);
  }

  const res = await db.prepare(`
    INSERT INTO periods (org_id, name, start_date, end_date, status)
    VALUES (?, ?, ?, ?, 'open')
  `).bind(org.id, name, start_date, end_date).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'CREATE_PERIOD',
    'period',
    Number(res.meta.last_row_id),
    `Membuat periode baru '${name}'`
  );

  return redirectWithFlash(c, backUrl, 'success', `Periode '${name}' berhasil dibuat.`);
});

orgAdminRoutes.post('/periods/:id/toggle-lock', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const isSuper = user.is_super_admin === 1;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/periods');

  if (!isSuper && role !== 'org_admin') {
    return redirectWithFlash(c, backUrl, 'error', 'Hanya Admin Organisasi atau Super Admin yang berhak Mengunci / Membuka Periode.');
  }

  const db = c.env.DB;
  const periodId = parseInt(c.req.param('id'), 10);
  const period = await db.prepare('SELECT * FROM periods WHERE id = ? AND org_id = ?').bind(periodId, org.id).first<Period>();
  if (!period) return redirectWithFlash(c, backUrl, 'error', 'Periode tidak ditemukan.');

  const newStatus = period.status === 'locked' ? 'open' : 'locked';
  const lockedAt = newStatus === 'locked' ? new Date().toISOString() : null;
  const lockedBy = newStatus === 'locked' ? user.id : null;

  await db.prepare('UPDATE periods SET status = ?, locked_at = ?, locked_by = ? WHERE id = ?')
    .bind(newStatus, lockedAt, lockedBy, periodId)
    .run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    newStatus === 'locked' ? 'LOCK_PERIOD' : 'UNLOCK_PERIOD',
    'period',
    periodId,
    `${user.email} mengubah status periode '${period.name}' menjadi: ${newStatus === 'locked' ? 'Tutup Buku (Terkunci)' : 'Terbuka'}`
  );

  return redirectWithFlash(c, backUrl, 'success', `Periode '${period.name}' ${newStatus === 'locked' ? 'berhasil dikunci (Tutup Buku)' : 'berhasil dibuka kembali'}.`);
});

// 6. Settings & Members (Org Admin or Super Admin only)
orgAdminRoutes.get('/settings', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as (User & { memberships: Record<number, OrgRole> });
  const role = c.get('currentRole' as never) as string;
  if (!user.is_super_admin && role !== 'org_admin') {
    return redirectWithFlash(c, adminUrl(c, org, ''), 'error', 'Hanya Admin Organisasi atau Super Admin yang dapat mengakses Pengaturan Organisasi.');
  }

  const data = await fetchAdminViewData(c, 'settings');
  return c.html(renderLayout({
    title: `Pengaturan & Akun — ${data.org.name}`,
    user,
    org: data.org,
    currentRole: data.currentRole,
    baseDomain: data.baseDomain,
    isSubdomainHost: data.isSubdomainHost,
    activeTab: 'admin',
    adminSubTab: data.subTab,
    flashMessage: consumeFlash(c),
    content: renderOrgAdminPage(data)
  }));
});

orgAdminRoutes.post('/settings', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/settings');
  if (!user.is_super_admin && role !== 'org_admin') return redirectWithFlash(c, backUrl, 'error', 'Akses ditolak.');

  const db = c.env.DB;
  const body = await c.req.parseBody();

  const name = String(body.name || '').trim();
  const short_code = String(body.short_code || '').trim() || null;
  const is_public = body.is_public === '0' ? 0 : 1;
  const deduction_mode = String(body.deduction_mode || 'auto_percent');
  const deduction_value = parseFloat(String(body.deduction_value || '5')) || 0;
  const payroll_cash_mode = String(body.payroll_cash_mode || 'deduction_only');
  const payroll_post_grouping = body.payroll_post_grouping === 'batch_recap' ? 'batch_recap' : 'individual';

  if (!name) return redirectWithFlash(c, backUrl, 'error', 'Nama organisasi tidak boleh kosong.');
  if (deduction_value < 0) return redirectWithFlash(c, backUrl, 'error', 'Nilai potongan tidak boleh negatif.');

  try {
    await db.prepare(`
      UPDATE organizations
      SET name = ?, short_code = ?, is_public = ?, deduction_mode = ?, deduction_value = ?, payroll_cash_mode = ?, payroll_post_grouping = ?
      WHERE id = ?
    `).bind(name, short_code, is_public, deduction_mode, deduction_value, payroll_cash_mode, payroll_post_grouping, org.id).run();
  } catch {
    await db.prepare(`ALTER TABLE organizations ADD COLUMN payroll_post_grouping TEXT NOT NULL DEFAULT 'individual'`).run().catch(() => {});
    await db.prepare(`
      UPDATE organizations
      SET name = ?, short_code = ?, is_public = ?, deduction_mode = ?, deduction_value = ?, payroll_cash_mode = ?, payroll_post_grouping = ?
      WHERE id = ?
    `).bind(name, short_code, is_public, deduction_mode, deduction_value, payroll_cash_mode, payroll_post_grouping, org.id).run();
  }

  const diffs: string[] = [];
  if (org.name !== name) diffs.push(`Nama: '${org.name}' -> '${name}'`);
  if (org.is_public !== is_public) diffs.push(`Visibilitas: ${org.is_public ? 'Publik' : 'Privat'} -> ${is_public ? 'Publik' : 'Privat'}`);
  if (org.deduction_mode !== deduction_mode || org.deduction_value !== deduction_value) {
    diffs.push(`Potongan: ${org.deduction_mode} (${org.deduction_value}) -> ${deduction_mode} (${deduction_value})`);
  }
  if (org.payroll_cash_mode !== payroll_cash_mode) diffs.push(`Aliran Kas: ${org.payroll_cash_mode} -> ${payroll_cash_mode}`);
  if ((org.payroll_post_grouping || 'individual') !== payroll_post_grouping) {
    diffs.push(`Posting Kas: ${org.payroll_post_grouping || 'individual'} -> ${payroll_post_grouping}`);
  }

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'UPDATE_ORG_SETTINGS',
    'organization',
    org.id,
    diffs.length > 0 ? `Perubahan pengaturan: ${diffs.join('; ')}` : `Pengaturan organisasi disimpan tanpa perubahan nilai.`
  );

  return redirectWithFlash(c, backUrl, 'success', 'Pengaturan organisasi berhasil disimpan.');
});

// Update Subdomain
orgAdminRoutes.post('/subdomain', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const backUrl = adminUrl(c, org, '/settings');

  if (!user.is_super_admin && (role !== 'org_admin' || !org.allow_admin_subdomain_edit)) {
    return redirectWithFlash(c, backUrl, 'error', 'Akses mengubah subdomain dikunci oleh Super Admin.');
  }

  const db = c.env.DB;
  const body = await c.req.parseBody();
  const rawSub = String(body.subdomain || '').trim().toLowerCase();

  const val = validateSubdomain(rawSub);
  if (!val.valid) {
    return redirectWithFlash(c, backUrl, 'error', val.error || 'Subdomain tidak valid.');
  }

  const uniqueSub = await resolveUniqueSubdomain(db, rawSub, org.id);

  // Record old subdomain alias for 301 redirect (REV-015)
  if (org.subdomain && org.subdomain !== uniqueSub) {
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS subdomain_aliases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          old_subdomain TEXT NOT NULL UNIQUE,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await db.prepare(`
        INSERT INTO subdomain_aliases (old_subdomain, org_id)
        VALUES (?, ?)
        ON CONFLICT(old_subdomain) DO UPDATE SET org_id = excluded.org_id
      `).bind(org.subdomain, org.id).run();
      await db.prepare('DELETE FROM subdomain_aliases WHERE old_subdomain = ?').bind(uniqueSub).run();
    } catch {
      // Ignore if alias table creation fails
    }
  }

  // Update subdomain and slug
  await db.prepare('UPDATE organizations SET subdomain = ?, slug = ? WHERE id = ?')
    .bind(uniqueSub, uniqueSub, org.id)
    .run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'UPDATE_SUBDOMAIN',
    'organization',
    org.id,
    `Subdomain organisasi diubah dari '${org.subdomain}.${baseDomain}' menjadi '${uniqueSub}.${baseDomain}'`
  );

  // Redirect to new subdomain in production or new path in dev
  const isProd = c.req.url.startsWith('https://');
  const targetUrl = isProd
    ? `https://${uniqueSub}.${baseDomain}/admin/settings`
    : `/org/${uniqueSub}/admin/settings`;
  return redirectWithFlash(c, targetUrl, 'success', `Subdomain berhasil diubah menjadi ${uniqueSub}.${baseDomain}. Tautan lama akan otomatis diarahkan (301).`);
});

// Add Member
orgAdminRoutes.post('/members', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/settings');
  if (!user.is_super_admin && role !== 'org_admin') return redirectWithFlash(c, backUrl, 'error', 'Akses ditolak.');

  const db = c.env.DB;
  const body = await c.req.parseBody();
  const email = String(body.email || '').trim().toLowerCase();
  const newRole = String(body.role || 'member') as OrgRole;

  if (!email) return redirectWithFlash(c, backUrl, 'error', 'Email tidak boleh kosong.');

  let target = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').bind(email).first<User>();
  if (!target) {
    const res = await db.prepare('INSERT INTO users (email, is_super_admin, is_active) VALUES (?, 0, 1)').bind(email).run();
    target = { id: Number(res.meta.last_row_id), email } as User;
  }

  await db.prepare(`
    INSERT INTO org_memberships (org_id, user_id, role, assigned_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role, assigned_by = excluded.assigned_by
  `).bind(org.id, target.id, newRole, user.id).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'ASSIGN_ORG_MEMBER',
    'user',
    target.id,
    `Menetapkan role '${newRole}' untuk akun '${email}' pada organisasi`
  );

  return redirectWithFlash(c, backUrl, 'success', `Akun '${email}' berhasil ditambahkan sebagai '${newRole}'.`);
});

// Update Member Role
orgAdminRoutes.post('/members/:id/role', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/settings');
  if (!user.is_super_admin && role !== 'org_admin') return redirectWithFlash(c, backUrl, 'error', 'Akses ditolak.');

  const db = c.env.DB;
  const memId = parseInt(c.req.param('id'), 10);
  const body = await c.req.parseBody();
  const newRole = String(body.role) as OrgRole;

  const existingMem = await db.prepare('SELECT role FROM org_memberships WHERE id = ? AND org_id = ?')
    .bind(memId, org.id)
    .first<{ role: string }>();

  await db.prepare('UPDATE org_memberships SET role = ?, assigned_by = ? WHERE id = ? AND org_id = ?')
    .bind(newRole, user.id, memId, org.id)
    .run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'UPDATE_MEMBER_ROLE',
    'membership',
    memId,
    `Keanggotaan #${memId}: role '${existingMem?.role || '-'}' -> '${newRole}'`
  );

  return redirectWithFlash(c, backUrl, 'success', 'Role anggota berhasil diperbarui.');
});

// Remove Member
orgAdminRoutes.post('/members/:id/delete', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const backUrl = adminUrl(c, org, '/settings');
  if (!user.is_super_admin && role !== 'org_admin') return redirectWithFlash(c, backUrl, 'error', 'Akses ditolak.');

  const db = c.env.DB;
  const memId = parseInt(c.req.param('id'), 10);

  await db.prepare('DELETE FROM org_memberships WHERE id = ? AND org_id = ?').bind(memId, org.id).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'REMOVE_ORG_MEMBER',
    'membership',
    memId,
    `Mencabut keanggotaan #${memId} dari organisasi`
  );

  return redirectWithFlash(c, backUrl, 'success', 'Keanggotaan berhasil dicabut.');
});

// 7. Reply to Feedback (REV-006)
orgAdminRoutes.post('/saran/:id/reply', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  const user = c.get('currentUser' as never) as unknown as User;
  const role = c.get('currentRole' as never) as string;
  const saranUrl = (c.get('isSubdomainHost' as never) ? '' : `/org/${org.slug}`) + '/saran';

  if (!user.is_super_admin && !['org_admin', 'treasurer'].includes(role)) {
    return redirectWithFlash(c, saranUrl, 'error', 'Hanya Bendahara atau Admin Organisasi yang berhak membalas aspirasi.');
  }

  const db = c.env.DB;
  const fbId = parseInt(c.req.param('id'), 10);
  const body = await c.req.parseBody();
  const reply = String(body.reply || '').trim();

  if (!reply) {
    return redirectWithFlash(c, saranUrl, 'error', 'Isi tanggapan tidak boleh kosong.');
  }

  const fb = await db.prepare('SELECT id FROM feedbacks WHERE id = ? AND org_id = ?').bind(fbId, org.id).first<{ id: number }>();
  if (!fb) {
    return redirectWithFlash(c, saranUrl, 'error', 'Aspirasi tidak ditemukan.');
  }

  await db.prepare(`
    UPDATE feedbacks
    SET treasurer_reply = ?, replied_by = ?, replied_at = CURRENT_TIMESTAMP
    WHERE id = ? AND org_id = ?
  `).bind(reply, user.id, fbId, org.id).run();

  await logAudit(
    db,
    org.id,
    user.id,
    user.email,
    'REPLY_FEEDBACK',
    'feedback',
    fbId,
    `Pengelola (${user.email}) memberikan tanggapan resmi pada aspirasi #${fbId}`
  );

  return redirectWithFlash(c, saranUrl, 'success', 'Tanggapan resmi berhasil disimpan.');
});
