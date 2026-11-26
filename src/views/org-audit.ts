import { escapeHtml, formatDateTime, renderEmptyState } from '../lib/format';
import type { Organization, AuditLog } from '../types';

export function renderOrgAuditPage(org: Organization, logs: AuditLog[], isSubdomainHost?: boolean): string {
  const rows = logs.map((l, idx) => `
    <tr>
      <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
      <td class="tabular" style="white-space: nowrap;">${formatDateTime(l.created_at)}</td>
      <td><strong>${escapeHtml(l.actor_email)}</strong></td>
      <td><span class="badge badge-muted">${escapeHtml(l.action)}</span></td>
      <td><span class="mono">${escapeHtml(l.target_type)} ${l.target_id ? `(#${escapeHtml(l.target_id)})` : ''}</span></td>
      <td>${escapeHtml(l.summary)}</td>
    </tr>
  `).join('');

  return `
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 16px; font-weight: 700; text-transform: uppercase;">Log Audit Transparansi Keuangan</h2>
      <p style="font-size: 12px; color: var(--ink-muted);">
        Seluruh aksi penambahan transaksi, penyesuaian denda, posting kas, dan perubahan konfigurasi dicatat secara permanen dan terbuka untuk diaudit.
      </p>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">No</th>
            <th>Waktu &amp; Tanggal</th>
            <th>Pelaku (Google Email)</th>
            <th>Aksi</th>
            <th>Target</th>
            <th>Keterangan Perubahan</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" style="padding: 0;">${renderEmptyState('Belum ada catatan aktivitas audit.')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
