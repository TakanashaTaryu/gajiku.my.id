import { escapeHtml, formatRupiah, formatDateTime } from '../lib/format';
import type { Organization, User, OrgMembership, AuditLog } from '../types';

export interface SuperAdminViewData {
  orgs: (Organization & { total_members: number; balance: number })[];
  users: (User & { memberships: { org_id: number; org_name: string; role: string }[] })[];
  auditLogs: AuditLog[];
  baseDomain: string;
}

export function renderSuperAdminPage(data: SuperAdminViewData): string {
  const { orgs, users, auditLogs, baseDomain } = data;

  const totalBalance = orgs.reduce((acc, o) => acc + (o.balance || 0), 0);
  const activeOrgsCount = orgs.filter(o => !o.is_archived).length;

  const orgRows = orgs.map((o, idx) => {
    const subUrl = `https://${o.subdomain}.${baseDomain}/`;
    return `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td>
          <strong><a href="${subUrl}" target="_blank">${escapeHtml(o.name)}</a></strong>
          <div style="font-size: 11px; color: var(--ink-muted);">
            Subdomain: <a href="${subUrl}" class="mono">${escapeHtml(o.subdomain)}.${escapeHtml(baseDomain)}</a>
          </div>
        </td>
        <td><span class="badge ${o.is_public ? 'badge-success' : 'badge-warn'}">${o.is_public ? 'Publik' : 'Privat'}</span></td>
        <td class="num tabular">${o.total_members}</td>
        <td class="num tabular"><strong>${formatRupiah(o.balance)}</strong></td>
        <td style="text-align: center;">
          <span class="badge ${o.is_archived ? 'badge-danger' : 'badge-success'}">${o.is_archived ? 'Diarsipkan' : 'Aktif'}</span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <a href="${subUrl}admin" target="_blank" class="btn btn-sm">[Kelola Kas]</a>
          <form method="POST" action="/super-admin/orgs/${o.id}/toggle-archive" style="display:inline; margin-left: 4px;" onsubmit="return confirm('${o.is_archived ? 'Aktifkan kembali' : 'Arsipkan'} organisasi ${escapeHtml(o.name)}?')">
            <button type="submit" class="btn btn-sm">${o.is_archived ? 'Aktifkan' : 'Arsipkan'}</button>
          </form>
          <form method="POST" action="/super-admin/orgs/${o.id}/delete" style="display:inline; margin-left: 4px;" onsubmit="return confirm('Hapus permanen organisasi ${escapeHtml(o.name)} beserta seluruh datanya?')">
            <button type="submit" class="link-btn" style="color: var(--ink-expense); font-size: 11px;">[Hapus]</button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  const orgOptions = orgs.map(o => `
    <option value="${o.id}">${escapeHtml(o.name)} (${escapeHtml(o.subdomain)})</option>
  `).join('');

  const userRows = users.map((u, idx) => {
    const memberBadges = u.memberships.map(m => `
      <span class="badge badge-muted" style="margin: 2px;">
        ${escapeHtml(m.org_name)} [<strong>${escapeHtml(m.role)}</strong>]
        <form method="POST" action="/super-admin/unassign" style="display:inline;" onsubmit="return confirm('Cabut akses ${escapeHtml(u.email)} dari ${escapeHtml(m.org_name)}?')">
          <input type="hidden" name="user_id" value="${u.id}">
          <input type="hidden" name="org_id" value="${m.org_id}">
          <button type="submit" class="link-btn" style="color: var(--ink-expense); font-size: 10px; margin-left: 2px;">&times;</button>
        </form>
      </span>
    `).join('');

    return `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td>
          <strong>${escapeHtml(u.email)}</strong>
          ${u.name ? `<div style="font-size: 11px; color: var(--ink-muted);">${escapeHtml(u.name)}</div>` : ''}
        </td>
        <td style="text-align: center;">
          <span class="badge ${u.google_sub ? 'badge-success' : 'badge-warn'}">${u.google_sub ? 'Pernah Login' : 'Pre-Invite'}</span>
        </td>
        <td style="text-align: center;">
          <span class="badge ${u.is_super_admin ? 'badge-danger' : 'badge-muted'}">${u.is_super_admin ? 'SUPER ADMIN' : 'User'}</span>
        </td>
        <td>${memberBadges || '<span style="color: var(--ink-muted); font-size: 11px;">Belum ada penugasan</span>'}</td>
        <td style="text-align: center; white-space: nowrap;">
          <form method="POST" action="/super-admin/users/${u.id}/toggle-super" style="display:inline;" onsubmit="return confirm('Konfirmasi: ${u.is_super_admin ? 'Cabut hak Super Admin' : 'Jadikan Super Admin'} untuk ${escapeHtml(u.email)}?')">
            <button type="submit" class="btn btn-sm">${u.is_super_admin ? 'Cabut Super' : 'Jadikan Super'}</button>
          </form>
          <form method="POST" action="/super-admin/users/${u.id}/toggle-active" style="display:inline; margin-left: 4px;" onsubmit="return confirm('Konfirmasi: ${u.is_active ? 'Bekukan' : 'Aktifkan kembali'} akun ${escapeHtml(u.email)}?')">
            <button type="submit" class="btn btn-sm ${u.is_active ? '' : 'btn-primary'}">${u.is_active ? 'Bekukan' : 'Aktifkan'}</button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  const auditRows = auditLogs.slice(0, 30).map((l, idx) => `
    <tr>
      <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
      <td class="tabular" style="white-space: nowrap;">${formatDateTime(l.created_at)}</td>
      <td><strong>${escapeHtml(l.actor_email)}</strong></td>
      <td><span class="badge badge-muted">${escapeHtml(l.action)}</span></td>
      <td>${escapeHtml(l.summary)}</td>
    </tr>
  `).join('');

  return `
    <div style="margin-bottom: 20px;">
      <h2 style="font-size: 18px; font-weight: 700; text-transform: uppercase;">Pusat Manajemen Multi-Tenant &amp; Akun Global</h2>
      <p style="font-size: 12px; color: var(--ink-muted);">Kendali penuh atas seluruh organisasi (tenant), akun pengguna, dan log audit sistem.</p>
    </div>

    <!-- Stats -->
    <div class="summary-strip">
      <div class="stat-box">
        <div class="stat-label">Total Organisasi Aktif</div>
        <div class="stat-value">${activeOrgsCount} <span style="font-size: 12px; font-weight: normal; color: var(--ink-muted);">(${orgs.length} total)</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Total Akun Terdaftar</div>
        <div class="stat-value">${users.length} <span style="font-size: 12px; font-weight: normal; color: var(--ink-muted);">pengguna</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Total Saldo Kas Seluruh Tenant</div>
        <div class="stat-value balance">${formatRupiah(totalBalance)}</div>
      </div>
    </div>

    <!-- Form Tambah Organisasi / Tenant Baru dengan Auto-Subdomain Live Preview -->
    <div class="form-panel">
      <h3 class="form-title">Buat Organisasi / Tenant Baru</h3>
      <form method="POST" action="/super-admin/orgs">
        <div class="form-grid">
          <div class="form-group">
            <label>Nama Organisasi *</label>
            <input type="text" name="name" id="new_org_name" class="form-control" placeholder="Contoh: Organisasi 1" required oninput="handleOrgNameInput(this.value)">
          </div>
          <div class="form-group">
            <label>Subdomain Otomatis *</label>
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="text" name="subdomain" id="new_org_subdomain" class="form-control mono" required style="max-width: 200px;">
              <span class="mono">.${escapeHtml(baseDomain)}</span>
            </div>
            <p style="font-size: 11px; color: var(--ink-muted); margin-top: 4px;">
              Subdomain otomatis digenerate dari nama organisasi dan langsung aktif setelah disimpan.
            </p>
          </div>
          <div class="form-group">
            <label>Singkatan / Kode Singkat</label>
            <input type="text" name="short_code" class="form-control" placeholder="ORG1">
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Visibilitas</label>
            <select name="is_public" class="form-control">
              <option value="1">Publik (Terbuka untuk siapa saja)</option>
              <option value="0">Privat (Khusus Anggota)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Email Org Admin Pertama (Pre-Invite)</label>
            <input type="email" name="admin_email" class="form-control" placeholder="admin@example.com">
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 6px; margin-top: 24px;">
              <input type="checkbox" name="allow_admin_subdomain_edit" value="1" checked>
              <span>Izinkan Org Admin menyesuaikan subdomain di pengaturan</span>
            </label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">+ Simpan &amp; Aktifkan Organisasi Baru</button>
      </form>
    </div>

    <script>
      function handleOrgNameInput(val) {
        let slug = val.toLowerCase()
          .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .replace(/-+/g, '-');
        if (slug.length > 40) slug = slug.substring(0, 40).replace(/-+$/, '');
        document.getElementById('new_org_subdomain').value = slug;
      }
    </script>

    <!-- Tabel Daftar Organisasi -->
    <div style="margin-top: 24px; margin-bottom: 10px;">
      <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase;">Daftar Seluruh Organisasi (Tenant)</h3>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">No</th>
            <th>Nama Organisasi &amp; Alamat Subdomain</th>
            <th>Visibilitas</th>
            <th class="num">Anggota</th>
            <th class="num">Saldo Kas</th>
            <th style="text-align: center;">Status</th>
            <th style="text-align: center;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${orgRows}
        </tbody>
      </table>
    </div>

    <!-- Manajemen Semua Akun & Matrix Penugasan Global -->
    <div class="form-panel" style="margin-top: 32px;">
      <h3 class="form-title">Tambah / Assign Akun ke Organisasi (Global Matrix)</h3>
      <form method="POST" action="/super-admin/assign">
        <div class="form-grid">
          <div class="form-group">
            <label>Email Google Pengguna * (Pre-Invite didukung!)</label>
            <input type="email" name="email" class="form-control" placeholder="user@gmail.com" required>
          </div>
          <div class="form-group">
            <label>Pilih Organisasi *</label>
            <select name="org_id" class="form-control" required>
              ${orgOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Peran / Role *</label>
            <select name="role" class="form-control" required>
              <option value="member">member (Anggota)</option>
              <option value="auditor">auditor (Pengawas / DPM)</option>
              <option value="treasurer">treasurer (Bendahara)</option>
              <option value="org_admin">org_admin (Admin Organisasi)</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">+ Tetapkan Role Akun</button>
      </form>
    </div>

    <!-- Tabel Seluruh Akun Global -->
    <div style="margin-top: 24px; margin-bottom: 10px;">
      <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase;">Daftar Akun Global &amp; Keanggotaan</h3>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">No</th>
            <th>Email Google &amp; Profil</th>
            <th style="text-align: center;">Status Login</th>
            <th style="text-align: center;">Role Global</th>
            <th>Keanggotaan Organisasi</th>
            <th style="text-align: center;">Aksi Akun</th>
          </tr>
        </thead>
        <tbody>
          ${userRows}
        </tbody>
      </table>
    </div>

    <!-- Global Audit Log -->
    <div style="margin-top: 32px; margin-bottom: 10px;">
      <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase;">Log Audit Global (30 Aktivitas Terakhir)</h3>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">No</th>
            <th>Waktu</th>
            <th>Pelaku</th>
            <th>Aksi</th>
            <th>Ringkasan</th>
          </tr>
        </thead>
        <tbody>
          ${auditRows}
        </tbody>
      </table>
    </div>
  `;
}
