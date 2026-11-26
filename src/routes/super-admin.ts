import { Hono } from 'hono';
import type { Env, Organization, User, AuditLog, OrgRole } from '../types';
import { getCurrentUser } from '../lib/auth';
import { consumeFlash, redirectWithFlash } from '../lib/flash';
import { renderLayout } from '../views/layout';
import { renderSuperAdminPage } from '../views/super-admin';
import { slugifySubdomain, validateSubdomain, resolveUniqueSubdomain } from '../lib/subdomain';
import { logAudit } from '../lib/audit';

export const superAdminRoutes = new Hono<{ Bindings: Env }>();

// Middleware: Require Super Admin
superAdminRoutes.use('*', async (c, next) => {
  const user = await getCurrentUser(c);
  if (!user || !user.is_super_admin) {
    const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
    return c.html(renderLayout({
      title: 'Akses Ditolak',
      user,
      baseDomain,
      content: `<div class="alert alert-error">Akses terbatas. Anda harus login sebagai Super Admin untuk membuka halaman ini.</div><a href="/auth/google" class="btn">&larr; Masuk dengan Akun Super Admin</a>`
    }), 403);
  }
  c.set('currentUser' as never, user as never);
  await next();
});

// 1. Super Admin Dashboard
superAdminRoutes.get('/', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User & { memberships: Record<number, OrgRole> };
  const db = c.env.DB;
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';

  // Load organizations with balance & member count
  const orgs = await db.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM org_memberships m WHERE m.org_id = o.id) AS total_members,
      (
        COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.org_id = o.id AND t.type = 'income'), 0) -
        COALESCE((SELECT SUM(amount) FROM cash_transactions t WHERE t.org_id = o.id AND t.type = 'expense'), 0)
      ) AS balance
    FROM organizations o
    ORDER BY o.is_archived ASC, o.id DESC
  `).all<Organization & { total_members: number; balance: number }>();

  // Load all users with memberships
  const usersRaw = await db.prepare('SELECT * FROM users ORDER BY is_super_admin DESC, email ASC').all<User>();
  const membershipsRaw = await db.prepare(`
    SELECT m.user_id, m.org_id, m.role, o.name AS org_name
    FROM org_memberships m
    JOIN organizations o ON o.id = m.org_id
  `).all<{ user_id: number; org_id: number; role: string; org_name: string }>();

  const membershipMap = new Map<number, { org_id: number; org_name: string; role: string }[]>();
  for (const m of membershipsRaw.results) {
    if (!membershipMap.has(m.user_id)) {
      membershipMap.set(m.user_id, []);
    }
    membershipMap.get(m.user_id)!.push({
      org_id: m.org_id,
      org_name: m.org_name,
      role: m.role
    });
  }

  const users = usersRaw.results.map(u => ({
    ...u,
    memberships: membershipMap.get(u.id) || []
  }));

  // Load global audit logs
  const auditLogs = await db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 30').all<AuditLog>();

  const content = renderSuperAdminPage({
    orgs: orgs.results,
    users,
    auditLogs: auditLogs.results,
    baseDomain
  });

  return c.html(renderLayout({
    title: 'Pusat Kendali Super Admin',
    user,
    baseDomain,
    activeTab: 'super-admin',
    flashMessage: consumeFlash(c),
    content
  }));
});

// 2. Create Organization (Tenant)
superAdminRoutes.post('/orgs', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User;
  const db = c.env.DB;
  const body = await c.req.parseBody();

  const name = String(body.name || '').trim();
  let subdomain = String(body.subdomain || '').trim().toLowerCase();
  const short_code = String(body.short_code || '').trim() || null;
  const is_public = body.is_public === '0' ? 0 : 1;
  const allow_admin_subdomain_edit = body.allow_admin_subdomain_edit === '1' ? 1 : 0;
  const admin_email = String(body.admin_email || '').trim().toLowerCase();

  if (!name) {
    return redirectWithFlash(c, '/super-admin', 'error', 'Nama organisasi wajib diisi.');
  }

  if (!subdomain) {
    subdomain = slugifySubdomain(name);
  }

  const subValidation = validateSubdomain(subdomain);
  if (!subValidation.valid) {
    return redirectWithFlash(c, '/super-admin', 'error', subValidation.error || 'Subdomain tidak valid.');
  }

  // Ensure unique subdomain
  const uniqueSubdomain = await resolveUniqueSubdomain(db, subdomain);
  const slug = uniqueSubdomain; // keep slug identical to subdomain

  // Insert organization
  const res = await db.prepare(`
    INSERT INTO organizations (slug, subdomain, name, short_code, is_public, allow_admin_subdomain_edit, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(slug, uniqueSubdomain, name, short_code, is_public, allow_admin_subdomain_edit, user.id).run();

  const newOrgId = Number(res.meta.last_row_id);

  // If admin_email is provided, pre-invite / assign as org_admin
  if (admin_email) {
    let orgAdminUser = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').bind(admin_email).first<User>();
    if (!orgAdminUser) {
      const uRes = await db.prepare('INSERT INTO users (email, is_super_admin, is_active) VALUES (?, 0, 1)').bind(admin_email).run();
      orgAdminUser = { id: Number(uRes.meta.last_row_id), email: admin_email } as User;
    }
    await db.prepare('INSERT OR REPLACE INTO org_memberships (org_id, user_id, role, assigned_by) VALUES (?, ?, ?, ?)').bind(newOrgId, orgAdminUser.id, 'org_admin', user.id).run();
  }

  // Add default starter classes
  await db.prepare(`
    INSERT INTO org_classes (org_id, code, name, hourly_rate, sort_order)
    VALUES (?, 'UMUM', 'Operasional & Umum', 15000, 1)
  `).bind(newOrgId).run();

  // Create default Period 1
  await db.prepare(`
    INSERT INTO periods (org_id, name, status)
    VALUES (?, 'Periode 1', 'open')
  `).bind(newOrgId).run();

  await logAudit(
    db,
    newOrgId,
    user.id,
    user.email,
    'CREATE_ORG',
    'organization',
    newOrgId,
    `Super Admin membuat organisasi '${name}' (subdomain: ${uniqueSubdomain})`
  );

  return redirectWithFlash(c, '/super-admin', 'success', `Organisasi '${name}' berhasil dibuat pada subdomain ${uniqueSubdomain}.${c.env.BASE_DOMAIN || 'gajiku.my.id'}.`);
});

// 3. Toggle Archive Org
superAdminRoutes.post('/orgs/:id/toggle-archive', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User;
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);

  const org = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(id).first<Organization>();
  if (!org) return redirectWithFlash(c, '/super-admin', 'error', 'Organisasi tidak ditemukan.');

  const newArchive = org.is_archived ? 0 : 1;
  await db.prepare('UPDATE organizations SET is_archived = ? WHERE id = ?').bind(newArchive, id).run();

  await logAudit(
    db,
    id,
    user.id,
    user.email,
    'ARCHIVE_ORG',
    'organization',
    id,
    `Super Admin mengubah status arsip organisasi '${org.name}' menjadi: ${newArchive ? 'Diarsipkan' : 'Aktif'}`
  );

  return redirectWithFlash(c, '/super-admin', 'success', `Status arsip organisasi '${org.name}' diubah menjadi ${newArchive ? 'Diarsipkan' : 'Aktif'}.`);
});

// 4. Delete Organization
superAdminRoutes.post('/orgs/:id/delete', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User;
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);

  const org = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(id).first<Organization>();
  if (!org) return redirectWithFlash(c, '/super-admin', 'error', 'Organisasi tidak ditemukan.');

  await db.prepare('DELETE FROM organizations WHERE id = ?').bind(id).run();

  await logAudit(
    db,
    null,
    user.id,
    user.email,
    'DELETE_ORG',
    'organization',
    id,
    `Super Admin menghapus permanen organisasi '${org.name}' (#${id})`
  );

  return redirectWithFlash(c, '/super-admin', 'success', `Organisasi '${org.name}' telah dihapus permanen.`);
});

// 5. Assign User to Org
superAdminRoutes.post('/assign', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User;
  const db = c.env.DB;
  const body = await c.req.parseBody();

  const email = String(body.email || '').trim().toLowerCase();
  const orgId = parseInt(String(body.org_id), 10);
  const role = String(body.role) as OrgRole;

  if (!email || !orgId || !['org_admin', 'treasurer', 'auditor', 'member'].includes(role)) {
    return redirectWithFlash(c, '/super-admin', 'error', 'Data penugasan tidak lengkap atau role tidak valid.');
  }

  // Find or pre-invite user
  let targetUser = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').bind(email).first<User>();
  if (!targetUser) {
    const res = await db.prepare('INSERT INTO users (email, is_super_admin, is_active) VALUES (?, 0, 1)').bind(email).run();
    targetUser = { id: Number(res.meta.last_row_id), email } as User;
  }

  await db.prepare(`
    INSERT INTO org_memberships (org_id, user_id, role, assigned_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role, assigned_by = excluded.assigned_by
  `).bind(orgId, targetUser.id, role, user.id).run();

  await logAudit(
    db,
    orgId,
    user.id,
    user.email,
    'ASSIGN_ROLE',
    'user',
    targetUser.id,
    `Super Admin menetapkan role '${role}' untuk akun '${email}' pada organisasi #${orgId}`
  );

  return redirectWithFlash(c, '/super-admin', 'success', `Role '${role}' berhasil ditetapkan untuk ${email}.`);
});

// 6. Unassign User from Org
superAdminRoutes.post('/unassign', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User;
  const db = c.env.DB;
  const body = await c.req.parseBody();

  const userId = parseInt(String(body.user_id), 10);
  const orgId = parseInt(String(body.org_id), 10);

  await db.prepare('DELETE FROM org_memberships WHERE user_id = ? AND org_id = ?').bind(userId, orgId).run();

  await logAudit(
    db,
    orgId,
    user.id,
    user.email,
    'UNASSIGN_ROLE',
    'user',
    userId,
    `Super Admin mencabut keanggotaan user #${userId} dari organisasi #${orgId}`
  );

  return redirectWithFlash(c, '/super-admin', 'success', 'Keanggotaan pengguna berhasil dicabut dari organisasi.');
});

// 7. Toggle Super Admin (Anti-Lockout Protection!)
superAdminRoutes.post('/users/:id/toggle-super', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User;
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);

  const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  if (!target) return redirectWithFlash(c, '/super-admin', 'error', 'Akun pengguna tidak ditemukan.');

  // Anti-Lockout: if user is revoking their own super admin, check if there's at least one other active super admin
  if (target.id === user.id && target.is_super_admin === 1) {
    const superCount = await db.prepare('SELECT COUNT(*) as count FROM users WHERE is_super_admin = 1 AND is_active = 1 AND id != ?')
      .bind(user.id)
      .first<{ count: number }>();
    if (!superCount || superCount.count === 0) {
      return redirectWithFlash(c, '/super-admin', 'error', 'Operasi ditolak: Anda adalah satu-satunya Super Admin aktif pada sistem.');
    }
  }

  const newSuper = target.is_super_admin ? 0 : 1;
  await db.prepare('UPDATE users SET is_super_admin = ? WHERE id = ?').bind(newSuper, id).run();

  await logAudit(
    db,
    null,
    user.id,
    user.email,
    'TOGGLE_SUPER_ADMIN',
    'user',
    id,
    `Super Admin mengubah status super admin user '${target.email}' menjadi: ${newSuper ? 'Super Admin' : 'Biasa'}`
  );

  return redirectWithFlash(c, '/super-admin', 'success', `Status Super Admin untuk '${target.email}' diubah menjadi ${newSuper ? 'Super Admin' : 'User Biasa'}.`);
});

// 8. Toggle User Active (Freeze/Unfreeze)
superAdminRoutes.post('/users/:id/toggle-active', async (c) => {
  const user = c.get('currentUser' as never) as unknown as User;
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);

  if (id === user.id) {
    return redirectWithFlash(c, '/super-admin', 'error', 'Anda tidak dapat membekukan akun Anda sendiri.');
  }

  const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  if (!target) return redirectWithFlash(c, '/super-admin', 'error', 'Akun pengguna tidak ditemukan.');

  const newActive = target.is_active ? 0 : 1;
  await db.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(newActive, id).run();

  await logAudit(
    db,
    null,
    user.id,
    user.email,
    'TOGGLE_USER_ACTIVE',
    'user',
    id,
    `Super Admin mengubah status aktif akun '${target.email}' menjadi: ${newActive ? 'Aktif' : 'Dibekukan'}`
  );

  return redirectWithFlash(c, '/super-admin', 'success', `Status akun '${target.email}' diubah menjadi ${newActive ? 'Aktif' : 'Dibekukan'}.`);
});
