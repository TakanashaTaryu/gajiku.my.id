import { escapeHtml, formatRupiah, renderEmptyState } from '../lib/format';
import type { Organization } from '../types';

export interface OrgListItem extends Organization {
  active_period_name?: string;
  total_income: number;
  total_expense: number;
  balance: number;
  complete_proof_percent: number;
}

export function renderHomePage(orgs: OrgListItem[], baseDomain: string): string {
  const orgRows = orgs.map((org, idx) => {
    const subUrl = `https://${org.subdomain}.${baseDomain}/`;
    return `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td>
          <strong><a href="${subUrl}">${escapeHtml(org.name)}</a></strong>
          ${org.short_code ? `<span class="badge badge-muted" style="margin-left: 6px;">${escapeHtml(org.short_code)}</span>` : ''}
          <div style="font-size: 11px; color: var(--ink-muted); margin-top: 2px;">
            Alamat: <a href="${subUrl}" class="mono">${escapeHtml(org.subdomain)}.${escapeHtml(baseDomain)}</a>
          </div>
        </td>
        <td>${escapeHtml(org.active_period_name || 'Tidak Ada Periode Aktif')}</td>
        <td class="num income">${formatRupiah(org.total_income)}</td>
        <td class="num expense">${formatRupiah(org.total_expense)}</td>
        <td class="num tabular"><strong>${formatRupiah(org.balance)}</strong></td>
        <td style="text-align: center;">
          <span class="badge ${org.complete_proof_percent >= 80 ? 'badge-success' : (org.complete_proof_percent >= 50 ? 'badge-warn' : 'badge-danger')}">
            ${org.complete_proof_percent}%
          </span>
        </td>
        <td style="text-align: center;">
          <a href="${subUrl}" class="btn btn-sm">Buka Transparansi &rarr;</a>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="margin-bottom: 24px; padding: 16px; background-color: var(--bg-surface); border: 1px solid var(--border-strong);">
      <h2 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">Digitalisasi Transparansi Dana Organisasi Mahasiswa</h2>
      <p style="color: var(--ink-muted); font-size: 13px;">
        Portal terbuka untuk meninjau pembagian honorarium asisten, potongan kas, pencatatan denda, serta buku kas pengeluaran secara akuntabel tanpa login.
        Setiap organisasi memiliki subdomain independen di bawah <strong>${escapeHtml(baseDomain)}</strong>.
      </p>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Daftar Organisasi Aktif</h3>
      <span style="font-size: 12px; color: var(--ink-muted);">${orgs.length} Organisasi Terdaftar</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">No</th>
            <th>Nama Organisasi &amp; Subdomain</th>
            <th>Periode Aktif</th>
            <th class="num">Total Masuk</th>
            <th class="num">Total Keluar</th>
            <th class="num">Saldo Kas</th>
            <th style="text-align: center;">Bukti Lengkap</th>
            <th style="text-align: center;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${orgRows || `<tr><td colspan="8" style="padding: 0;">${renderEmptyState('Belum ada organisasi publik terdaftar.')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
