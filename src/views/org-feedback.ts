import { escapeHtml, formatDateTime, renderEmptyState } from '../lib/format';
import type { Organization, Feedback, User, OrgRole } from '../types';

export function renderOrgFeedbackPage(
  org: Organization,
  feedbacks: Feedback[],
  currentUser: User | null,
  isSubdomainHost?: boolean,
  currentRole?: OrgRole | null
): string {
  const orgPrefix = isSubdomainHost ? '' : `/org/${org.slug}`;
  const canReply = Boolean(
    currentUser && (currentUser.is_super_admin === 1 || currentRole === 'org_admin' || currentRole === 'treasurer')
  );

  const feedbackItems = feedbacks.map(f => `
    <div style="background-color: var(--bg-surface); border: 1px solid var(--border-strong); padding: 14px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--border-grid); padding-bottom: 6px; margin-bottom: 8px;">
        <div>
          <strong>${escapeHtml(f.sender_name)}</strong>
          ${f.nim ? `<span style="font-size: 12px; color: var(--ink-muted); margin-left: 6px;">(NIM: ${escapeHtml(f.nim)})</span>` : ''}
          <span class="badge badge-muted" style="margin-left: 6px;">${escapeHtml(f.topic)}</span>
          <span class="badge ${f.treasurer_reply ? 'badge-success' : 'badge-warn'}" style="margin-left: 4px;">
            ${f.treasurer_reply ? 'Sudah Ditanggapi' : 'Menunggu Tanggapan'}
          </span>
        </div>
        <span style="font-size: 12px; color: var(--ink-muted);" class="tabular">${formatDateTime(f.created_at)}</span>
      </div>
      <p style="font-size: 13px; margin-bottom: 8px; white-space: pre-wrap;">${escapeHtml(f.message)}</p>

      ${f.treasurer_reply ? `
        <div style="background-color: var(--bg-header); border-left: 3px solid var(--border-strong); padding: 8px 12px; margin-top: 8px; font-size: 13px;">
          <div style="font-weight: 700; margin-bottom: 2px;">Tanggapan Resmi Pengelola Organisasi:</div>
          <div style="white-space: pre-wrap;">${escapeHtml(f.treasurer_reply)}</div>
          ${f.replied_at ? `<div style="font-size: 12px; color: var(--ink-muted); margin-top: 4px;" class="tabular">Dibalas pada: ${formatDateTime(f.replied_at)}</div>` : ''}
        </div>
      ` : ''}

      ${canReply ? `
        <form method="POST" action="${orgPrefix}/admin/saran/${f.id}/reply" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-grid);">
          <div class="form-group" style="margin-bottom: 8px;">
            <label for="reply_${f.id}">${f.treasurer_reply ? 'Perbarui Tanggapan Resmi:' : 'Balas Aspirasi Ini (Bendahara / Admin):'}</label>
            <textarea id="reply_${f.id}" name="reply" rows="2" class="form-control" required placeholder="Tuliskan tanggapan resmi organisasi...">${escapeHtml(f.treasurer_reply || '')}</textarea>
          </div>
          <button type="submit" class="btn btn-sm btn-primary">${f.treasurer_reply ? 'Perbarui Tanggapan' : 'Kirim Tanggapan &rarr;'}</button>
        </form>
      ` : (!f.treasurer_reply ? `
        <div style="font-size: 12px; color: var(--ink-warn); margin-top: 6px;">[ Menunggu tanggapan dari bendahara / pengurus ]</div>
      ` : '')}
    </div>
  `).join('');

  return `
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 16px; font-weight: 700; text-transform: uppercase;">Kritik, Saran &amp; Transparansi Publik</h2>
      <p style="font-size: 12px; color: var(--ink-muted);">
        Ruang aspirasi terbuka bagi seluruh anggota dan mahasiswa untuk memberikan masukan terkait keuangan, jam kerja asistensi, dan bukti kas.
      </p>
    </div>

    <!-- Form Submit Saran -->
    <div class="form-panel">
      <h3 class="form-title">Kirim Kritik atau Pertanyaan</h3>
      <form method="POST" action="${orgPrefix}/saran">
        <div class="form-grid">
          <div class="form-group">
            <label for="fb_sender_name">Nama Pengirim (Opsional / Biarkan 'Anonim')</label>
            <input type="text" id="fb_sender_name" name="sender_name" class="form-control" value="${escapeHtml(currentUser?.name || '')}" placeholder="Nama Anda (atau biarkan kosong)">
          </div>
          <div class="form-group">
            <label for="fb_nim">NIM (Opsional)</label>
            <input type="text" id="fb_nim" name="nim" class="form-control" placeholder="11012XXXXX">
          </div>
          <div class="form-group">
            <label for="fb_topic">Topik Aspirasi *</label>
            <select id="fb_topic" name="topic" class="form-control" required>
              <option value="Transparansi Dana">Transparansi Dana</option>
              <option value="Perhitungan Gaji">Perhitungan Gaji</option>
              <option value="Bukti Pengeluaran">Bukti Pengeluaran</option>
              <option value="Umum">Umum</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="fb_message">Pesan / Pertanyaan *</label>
          <textarea id="fb_message" name="message" rows="3" class="form-control" required placeholder="Tuliskan kritik, pertanyaan, atau masukan Anda di sini..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Kirim Aspirasi Sekarang &rarr;</button>
      </form>
    </div>

    <!-- Feedback List -->
    <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase; margin-bottom: 10px;">Daftar Aspirasi Masuk</h3>
    <div>
      ${feedbackItems || `<div style="border: 1px solid var(--border-strong);">${renderEmptyState('Belum ada aspirasi atau saran yang dikirimkan.')}</div>`}
    </div>
  `;
}
