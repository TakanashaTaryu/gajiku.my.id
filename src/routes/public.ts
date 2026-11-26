import { Hono } from 'hono';
import type { Env, Organization, Period, OrgClass, PayrollEntry, CashTransaction, Feedback, AuditLog, User, OrgRole } from '../types';
import { getCurrentUser } from '../lib/auth';
import { consumeFlash, redirectWithFlash } from '../lib/flash';
import { renderLayout } from '../views/layout';
import { renderHomePage, type OrgListItem } from '../views/home';
import { renderOrgDashboard, type ClassRecapItem } from '../views/org-dashboard';
import { renderOrgPayrollPage } from '../views/org-payroll';
import { renderOrgCashbookPage } from '../views/org-cashbook';
import { renderOrgAuditPage } from '../views/org-audit';
import { renderOrgFeedbackPage } from '../views/org-feedback';
import { buildMergeGroupSummary } from '../services/payroll';
import { computeRunningBalances } from '../services/cashbook';
import { generatePayrollCSV, generateCashCSV } from '../lib/csv';

import type { Context } from 'hono';

export const publicRoutes = new Hono<{ Bindings: Env }>();

// Helper: Enforce Private Organization access control (REV-004)
function checkOrgPublicAccess(
  c: Context<{ Bindings: Env }>,
  org: Organization,
  user: (User & { memberships: Record<number, OrgRole> }) | null,
  baseDomain: string,
  isSubdomainHost: boolean
): Response | null {
  if (org.is_public === 1) return null;

  const isMember = user && (user.is_super_admin === 1 || Boolean(user.memberships[org.id]));
  if (isMember) return null;

  const loginUrl = `/auth/google?next=${encodeURIComponent(c.req.url)}`;
  return c.html(renderLayout({
    title: `Akses Terbatas — ${org.name}`,
    user,
    org,
    currentRole: null,
    baseDomain,
    isSubdomainHost,
    content: `
      <div class="form-panel" style="max-width: 540px; margin: 32px auto;">
        <h2 class="form-title">Organisasi Privat (Akses Terbatas)</h2>
        <div class="alert alert-warn" style="margin-bottom: 14px;">
          Portal transparansi <strong>${org.name}</strong> diatur sebagai <strong>Privat (Khusus Anggota Terdaftar)</strong>.
        </div>
        ${user ? `
          <p style="font-size: 13px; color: var(--ink-muted); margin-bottom: 14px;">
            Akun Anda (<strong>${user.email}</strong>) belum terdaftar sebagai anggota pada organisasi ini. Hubungi Admin Organisasi untuk mendapatkan akses.
          </p>
          <a href="https://${baseDomain}/" class="btn">&larr; Kembali ke Direktori Utama</a>
        ` : `
          <p style="font-size: 13px; color: var(--ink-muted); margin-bottom: 14px;">
            Silakan masuk menggunakan akun Google yang terdaftar sebagai anggota organisasi ini.
          </p>
          <a href="${loginUrl}" class="btn btn-primary">[ Masuk dengan Google ] &rarr;</a>
        `}
      </div>
    `
  }), 403);
}

// 1. Root: Home Directory (on Apex) or Org Dashboard (on Subdomain)
publicRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const user = await getCurrentUser(c);
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const org = c.get('org' as never) as unknown as Organization | undefined;
  const isSubdomainHost = Boolean(c.get('isSubdomainHost' as never));

  if (org) {
    const blocked = checkOrgPublicAccess(c, org, user, baseDomain, isSubdomainHost);
    if (blocked) return blocked;
    // Serve Org Dashboard
    return handleOrgDashboard(c, org, user, baseDomain, isSubdomainHost);
  }

  // Serve Apex Home Directory
  const orgsRaw = await db.prepare(`
    SELECT o.*,
      (SELECT name FROM periods p WHERE p.org_id = o.id AND p.status = 'open' LIMIT 1) AS active_period_name,
      COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.org_id = o.id AND t.type = 'income'), 0) AS total_income,
      COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.org_id = o.id AND t.type = 'expense'), 0) AS total_expense,
      (SELECT COUNT(*) FROM cash_transactions t WHERE t.org_id = o.id AND t.type = 'expense') AS total_expense_count,
      (SELECT COUNT(*) FROM cash_transactions t WHERE t.org_id = o.id AND t.type = 'expense' AND t.proof_status = 'lengkap') AS complete_proof_count
    FROM organizations o
    WHERE o.is_archived = 0 AND (o.is_public = 1 OR ? = 1)
    ORDER BY o.id ASC
  `).bind(user?.is_super_admin ? 1 : 0).all<Organization & {
    active_period_name?: string;
    total_income: number;
    total_expense: number;
    total_expense_count: number;
    complete_proof_count: number;
  }>();

  const orgItems: OrgListItem[] = orgsRaw.results.map(o => {
    const balance = o.total_income - o.total_expense;
    const complete_proof_percent = o.total_expense_count > 0
      ? Math.round((o.complete_proof_count / o.total_expense_count) * 100)
      : 100;
    return {
      ...o,
      balance,
      complete_proof_percent
    };
  });

  const content = renderHomePage(orgItems, baseDomain);
  return c.html(renderLayout({
    title: 'Portal Transparansi Dana Organisasi Mahasiswa',
    user,
    baseDomain,
    activeTab: 'home',
    flashMessage: consumeFlash(c),
    content
  }));
});

// Helper for Org Dashboard
async function handleOrgDashboard(
  c: Context<{ Bindings: Env }>,
  org: Organization,
  user: (User & { memberships: Record<number, OrgRole> }) | null,
  baseDomain: string,
  isSubdomainHost: boolean
) {
  const db = c.env.DB;

  const periodsRaw = await db.prepare('SELECT * FROM periods WHERE org_id = ? ORDER BY id DESC').bind(org.id).all<Period>();
  const periods = periodsRaw.results;

  const periodIdParam = c.req.query('period');
  let selectedPeriod: Period | null = null;
  if (periodIdParam && periodIdParam !== 'all') {
    selectedPeriod = periods.find((p: Period) => p.id === parseInt(periodIdParam, 10)) || null;
  }
  if (!selectedPeriod && periodIdParam !== 'all' && periods.length > 0) {
    selectedPeriod = periods.find((p: Period) => p.status === 'open') || periods[0];
  }

  // Calculate totals
  let txQuery = 'SELECT * FROM cash_transactions WHERE org_id = ?';
  const txParams: (string | number)[] = [org.id];
  if (selectedPeriod) {
    txQuery += ' AND (period_id = ? OR period_id IS NULL)';
    txParams.push(selectedPeriod.id);
  }
  txQuery += ' ORDER BY tx_date DESC, id DESC';

  const txRaw = await db.prepare(txQuery).bind(...txParams).all<CashTransaction>();
  const transactions = txRaw.results;

  let totalIncome = 0;
  let totalExpense = 0;
  let expenseCount = 0;
  let completeCount = 0;

  for (const t of transactions) {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else {
      totalExpense += t.amount;
      expenseCount++;
      if (t.proof_status === 'lengkap') {
        completeCount++;
      }
    }
  }

  const balance = totalIncome - totalExpense;
  const proofPercent = expenseCount > 0 ? Math.round((completeCount / expenseCount) * 100) : 100;

  // Class recaps
  let payrollQuery = 'SELECT * FROM payroll_entries WHERE org_id = ?';
  const payrollParams: (string | number)[] = [org.id];
  if (selectedPeriod) {
    payrollQuery += ' AND period_id = ?';
    payrollParams.push(selectedPeriod.id);
  }
  const payrollRaw = await db.prepare(payrollQuery).bind(...payrollParams).all<PayrollEntry>();

  const classesRaw = await db.prepare('SELECT * FROM org_classes WHERE org_id = ? ORDER BY sort_order ASC').bind(org.id).all<OrgClass>();
  const classRecaps: ClassRecapItem[] = classesRaw.results.map((cls: OrgClass) => {
    const classEntries = payrollRaw.results.filter((e: PayrollEntry) => e.class_code === cls.code);
    return {
      code: cls.code,
      name: cls.name,
      member_count: classEntries.length,
      total_hours: classEntries.reduce((acc: number, e: PayrollEntry) => acc + e.hours, 0),
      total_gross: classEntries.reduce((acc: number, e: PayrollEntry) => acc + e.gross_pay, 0),
      total_kas_deduction: classEntries.reduce((acc: number, e: PayrollEntry) => acc + e.kas_deduction, 0),
      total_fine: classEntries.reduce((acc: number, e: PayrollEntry) => acc + e.fine_amount, 0),
      total_net: classEntries.reduce((acc: number, e: PayrollEntry) => acc + e.net_pay, 0)
    };
  }).filter((c: ClassRecapItem) => c.member_count > 0 || selectedPeriod !== null);

  const fbRaw = await db.prepare('SELECT * FROM feedbacks WHERE org_id = ? ORDER BY id DESC LIMIT 5').bind(org.id).all<Feedback>();

  const content = renderOrgDashboard({
    org,
    periods,
    selectedPeriod,
    totalIncome,
    totalExpense,
    balance,
    proofStats: {
      total: expenseCount,
      complete: completeCount,
      percent: proofPercent
    },
    classRecaps,
    recentTransactions: transactions,
    recentFeedbacks: fbRaw.results,
    isSubdomainHost
  });

  return c.html(renderLayout({
    title: `Dashboard Transparansi — ${org.name}`,
    user,
    org,
    currentRole: user?.memberships[org.id] || null,
    baseDomain,
    isSubdomainHost,
    activeTab: 'dashboard',
    flashMessage: consumeFlash(c),
    content
  }));
}

// 2. Gaji / Honorarium
publicRoutes.get('/gaji', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  if (!org) return c.redirect('/');

  const db = c.env.DB;
  const user = await getCurrentUser(c);
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isSubdomainHost = c.get('isSubdomainHost' as never) as boolean;

  const blocked = checkOrgPublicAccess(c, org, user, baseDomain, isSubdomainHost);
  if (blocked) return blocked;

  const periodsRaw = await db.prepare('SELECT * FROM periods WHERE org_id = ? ORDER BY id DESC').bind(org.id).all<Period>();
  const periods = periodsRaw.results;

  const periodIdParam = c.req.query('period');
  let selectedPeriod: Period | null = null;
  if (periodIdParam && periodIdParam !== 'all') {
    selectedPeriod = periods.find(p => p.id === parseInt(periodIdParam, 10)) || null;
  }
  if (!selectedPeriod && periodIdParam !== 'all' && periods.length > 0) {
    selectedPeriod = periods.find(p => p.status === 'open') || periods[0];
  }

  const selectedClassCode = c.req.query('class') || null;
  const searchQuery = c.req.query('q') || '';

  const classesRaw = await db.prepare('SELECT * FROM org_classes WHERE org_id = ? ORDER BY sort_order ASC').bind(org.id).all<OrgClass>();
  const classes = classesRaw.results;

  let query = 'SELECT * FROM payroll_entries WHERE org_id = ?';
  const params: (string | number)[] = [org.id];
  if (selectedPeriod) {
    query += ' AND period_id = ?';
    params.push(selectedPeriod.id);
  }
  query += ' ORDER BY class_code ASC, member_name ASC';

  const entriesRaw = await db.prepare(query).bind(...params).all<PayrollEntry>();
  const entries = entriesRaw.results;

  // Class recaps
  const classRecaps: ClassRecapItem[] = classes.map(cls => {
    const classEntries = entries.filter(e => e.class_code === cls.code);
    return {
      code: cls.code,
      name: cls.name,
      member_count: classEntries.length,
      total_hours: classEntries.reduce((acc, e) => acc + e.hours, 0),
      total_gross: classEntries.reduce((acc, e) => acc + e.gross_pay, 0),
      total_kas_deduction: classEntries.reduce((acc, e) => acc + e.kas_deduction, 0),
      total_fine: classEntries.reduce((acc, e) => acc + e.fine_amount, 0),
      total_net: classEntries.reduce((acc, e) => acc + e.net_pay, 0)
    };
  }).filter(c => c.member_count > 0 || selectedPeriod !== null);

  // Merge groups (e.g. TE_COMBINED)
  const mergeGroupCodes = Array.from(new Set(entries.map(e => e.merge_group).filter(Boolean))) as string[];
  const mergeGroupSummaries = mergeGroupCodes.map(mgCode => buildMergeGroupSummary(entries, mgCode));

  const content = renderOrgPayrollPage({
    org,
    periods,
    selectedPeriod,
    classes,
    selectedClassCode,
    searchQuery,
    entries,
    classRecaps,
    mergeGroupSummaries,
    isSubdomainHost
  });

  return c.html(renderLayout({
    title: `Honorarium / Gaji — ${org.name}`,
    user,
    org,
    currentRole: user?.memberships[org.id] || null,
    baseDomain,
    isSubdomainHost,
    activeTab: 'gaji',
    flashMessage: consumeFlash(c),
    content
  }));
});

// 3. Kas
publicRoutes.get('/kas', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  if (!org) return c.redirect('/');

  const db = c.env.DB;
  const user = await getCurrentUser(c);
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isSubdomainHost = c.get('isSubdomainHost' as never) as boolean;

  const blocked = checkOrgPublicAccess(c, org, user, baseDomain, isSubdomainHost);
  if (blocked) return blocked;

  const periodsRaw = await db.prepare('SELECT * FROM periods WHERE org_id = ? ORDER BY id DESC').bind(org.id).all<Period>();
  const periods = periodsRaw.results;

  const periodIdParam = c.req.query('period');
  let selectedPeriod: Period | null = null;
  if (periodIdParam && periodIdParam !== 'all') {
    selectedPeriod = periods.find(p => p.id === parseInt(periodIdParam, 10)) || null;
  }

  const selectedType = c.req.query('type') || 'all';
  const selectedProofStatus = c.req.query('proof') || 'all';

  // Load all transactions for org to compute running balance accurately
  const allTxRaw = await db.prepare('SELECT * FROM cash_transactions WHERE org_id = ? ORDER BY tx_date ASC, id ASC').bind(org.id).all<CashTransaction>();
  const txWithBalances = computeRunningBalances(allTxRaw.results);

  // Apply filters
  let filtered = txWithBalances;
  if (selectedPeriod) {
    filtered = filtered.filter(t => t.period_id === selectedPeriod.id);
  }
  if (selectedType !== 'all') {
    filtered = filtered.filter(t => t.type === selectedType);
  }
  if (selectedProofStatus !== 'all') {
    filtered = filtered.filter(t => t.proof_status === selectedProofStatus);
  }

  // Reverse to show newest first
  filtered.sort((a, b) => {
    if (a.tx_date !== b.tx_date) return b.tx_date.localeCompare(a.tx_date);
    return b.id - a.id;
  });

  const totalIncome = allTxRaw.results.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = allTxRaw.results.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const currentBalance = totalIncome - totalExpense;

  const filteredIncome = filtered.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const filteredExpense = filtered.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const isFiltered = Boolean(selectedPeriod || selectedType !== 'all' || selectedProofStatus !== 'all');

  const content = renderOrgCashbookPage({
    org,
    periods,
    selectedPeriod,
    selectedType,
    selectedProofStatus,
    transactions: filtered,
    totalIncome,
    totalExpense,
    currentBalance,
    filteredIncome,
    filteredExpense,
    isFiltered,
    isSubdomainHost
  });

  return c.html(renderLayout({
    title: `Buku Kas — ${org.name}`,
    user,
    org,
    currentRole: user?.memberships[org.id] || null,
    baseDomain,
    isSubdomainHost,
    activeTab: 'kas',
    flashMessage: consumeFlash(c),
    content
  }));
});

// 4. Audit
publicRoutes.get('/audit', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  if (!org) return c.redirect('/');

  const db = c.env.DB;
  const user = await getCurrentUser(c);
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isSubdomainHost = c.get('isSubdomainHost' as never) as boolean;

  const blocked = checkOrgPublicAccess(c, org, user, baseDomain, isSubdomainHost);
  if (blocked) return blocked;

  const logsRaw = await db.prepare('SELECT * FROM audit_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT 100').bind(org.id).all<AuditLog>();

  const content = renderOrgAuditPage(org, logsRaw.results, isSubdomainHost);
  return c.html(renderLayout({
    title: `Log Audit — ${org.name}`,
    user,
    org,
    currentRole: user?.memberships[org.id] || null,
    baseDomain,
    isSubdomainHost,
    activeTab: 'audit',
    flashMessage: consumeFlash(c),
    content
  }));
});

// 5. Saran
publicRoutes.get('/saran', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  if (!org) return c.redirect('/');

  const db = c.env.DB;
  const user = await getCurrentUser(c);
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isSubdomainHost = c.get('isSubdomainHost' as never) as boolean;

  const blocked = checkOrgPublicAccess(c, org, user, baseDomain, isSubdomainHost);
  if (blocked) return blocked;

  const fbRaw = await db.prepare('SELECT * FROM feedbacks WHERE org_id = ? ORDER BY id DESC').bind(org.id).all<Feedback>();
  const currentRole = user?.memberships[org.id] || null;

  const content = renderOrgFeedbackPage(org, fbRaw.results, user, isSubdomainHost, currentRole);
  return c.html(renderLayout({
    title: `Kritik & Saran — ${org.name}`,
    user,
    org,
    currentRole,
    baseDomain,
    isSubdomainHost,
    activeTab: 'saran',
    flashMessage: consumeFlash(c),
    content
  }));
});

publicRoutes.post('/saran', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  if (!org) return c.redirect('/');

  const db = c.env.DB;
  const user = await getCurrentUser(c);
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isSubdomainHost = Boolean(c.get('isSubdomainHost' as never));
  const blocked = checkOrgPublicAccess(c, org, user, baseDomain, isSubdomainHost);
  if (blocked) return blocked;

  const prefix = (isSubdomainHost ? '' : `/org/${org.slug}`) + '/saran';
  const body = await c.req.parseBody();

  const sender_name = String(body.sender_name || '').trim() || 'Anonim';
  const nim = String(body.nim || '').trim() || null;
  const topic = String(body.topic || 'Umum').trim();
  const message = String(body.message || '').trim();

  const validTopics = ['Transparansi Dana', 'Perhitungan Gaji', 'Bukti Pengeluaran', 'Umum'];
  if (!validTopics.includes(topic)) {
    return redirectWithFlash(c, prefix, 'error', 'Topik aspirasi tidak valid. Pilih salah satu topik yang tersedia.');
  }

  if (!message) {
    return redirectWithFlash(c, prefix, 'error', 'Pesan kritik & saran tidak boleh kosong.');
  }

  await db.prepare(`
    INSERT INTO feedbacks (org_id, user_id, sender_name, nim, topic, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(org.id, user?.id || null, sender_name, nim, topic, message).run();

  return redirectWithFlash(c, prefix, 'success', 'Terima kasih, aspirasi Anda telah berhasil dikirimkan.');
});

// 6. Export CSV Gaji
publicRoutes.get('/export/gaji.csv', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  if (!org) return c.text('Not Found', 404);

  const user = await getCurrentUser(c);
  if (org.is_public === 0 && !(user && (user.is_super_admin === 1 || Boolean(user.memberships[org.id])))) {
    return c.text('Akses Terbatas: Organisasi Privat', 403);
  }

  const db = c.env.DB;
  const periodId = c.req.query('period');

  let query = 'SELECT * FROM payroll_entries WHERE org_id = ?';
  const params: (string | number)[] = [org.id];
  let periodName = 'Semua Periode';

  if (periodId && periodId !== 'all') {
    const period = await db.prepare('SELECT * FROM periods WHERE id = ?').bind(periodId).first<Period>();
    if (period) {
      periodName = period.name;
      query += ' AND period_id = ?';
      params.push(period.id);
    }
  }

  query += ' ORDER BY class_code ASC, member_name ASC';
  const entriesRaw = await db.prepare(query).bind(...params).all<PayrollEntry>();

  const csvContent = generatePayrollCSV(entriesRaw.results, periodName);
  const filename = `gaji-${org.slug}-${periodName.toLowerCase().replace(/\s+/g, '-')}.csv`;

  return c.text(csvContent, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`
  });
});

// 7. Export CSV Kas
publicRoutes.get('/export/kas.csv', async (c) => {
  const org = c.get('org' as never) as unknown as Organization;
  if (!org) return c.text('Not Found', 404);

  const user = await getCurrentUser(c);
  if (org.is_public === 0 && !(user && (user.is_super_admin === 1 || Boolean(user.memberships[org.id])))) {
    return c.text('Akses Terbatas: Organisasi Privat', 403);
  }

  const db = c.env.DB;
  const txRaw = await db.prepare('SELECT * FROM cash_transactions WHERE org_id = ? ORDER BY tx_date ASC, id ASC').bind(org.id).all<CashTransaction>();

  const csvContent = generateCashCSV(txRaw.results);
  const filename = `kas-${org.slug}.csv`;

  return c.text(csvContent, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`
  });
});
