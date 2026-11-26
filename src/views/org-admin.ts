import { escapeHtml, formatRupiah, formatHours, formatDate, renderEmptyState } from '../lib/format';
import type { Organization, Period, OrgClass, PayrollEntry, CashTransaction, Feedback, OrgMembership, OrgRole, User } from '../types';

export interface OrgAdminViewData {
  org: Organization;
  currentRole: OrgRole;
  isSuperAdmin: boolean;
  subTab: 'overview' | 'kas' | 'gaji' | 'classes' | 'periods' | 'settings';
  periods: Period[];
  selectedPeriod: Period | null;
  classes: OrgClass[];
  entries: PayrollEntry[];
  transactions: CashTransaction[];
  feedbacks: Feedback[];
  memberships: (OrgMembership & { user_email: string; user_name: string })[];
  baseDomain: string;
  isSubdomainHost?: boolean;
}

export function renderOrgAdminPage(data: OrgAdminViewData): string {
  const { org, currentRole, isSuperAdmin, subTab, periods, selectedPeriod, classes, entries, transactions, feedbacks, memberships, baseDomain, isSubdomainHost } = data;
  const orgPrefix = isSubdomainHost ? '' : `/org/${org.slug}`;
  const adminPrefix = `${orgPrefix}/admin`;

  const isOrgAdminOrSuper = isSuperAdmin || currentRole === 'org_admin';
  const isAuditor = currentRole === 'auditor';

  // Sub-navigation bar (compact on desktop since sidebar also shows admin links, helpful quick-jump)
  const navHtml = '';

  // Render SubTab Content
  let tabContent = '';

  if (subTab === 'overview') {
    const unprovenCount = transactions.filter(t => t.type === 'expense' && t.proof_status === 'belum_ada').length;
    const pendingVerificationCount = transactions.filter(t => t.proof_status === 'menunggu_verifikasi').length;
    const unpostedPayrollCount = entries.filter(e => e.posted_to_kas === 0).length;
    const unrepliedFeedbackCount = feedbacks.filter(f => !f.treasurer_reply).length;

    tabContent = `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 15px; font-weight: 700; text-transform: uppercase;">Ringkasan Tugas Pengelola (${escapeHtml(currentRole.toUpperCase())})</h3>
        <p style="font-size: 12px; color: var(--ink-muted);">Daftar item operasional yang membutuhkan perhatian dan tindakan.</p>
      </div>

      <div class="summary-strip">
        <div class="stat-box">
          <div class="stat-label">Pengeluaran Belum Ada Bukti</div>
          <div class="stat-value expense">${unprovenCount} <span style="font-size: 12px; font-weight: normal;">transaksi</span></div>
          <div style="margin-top: 8px;"><a href="${adminPrefix}/kas" style="font-size: 11px;">Kelola Bukti &rarr;</a></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Menunggu Verifikasi Auditor</div>
          <div class="stat-value" style="color: var(--ink-warn);">${pendingVerificationCount} <span style="font-size: 12px; font-weight: normal;">transaksi</span></div>
          <div style="margin-top: 8px;"><a href="${adminPrefix}/kas" style="font-size: 11px;">Verifikasi Bukti &rarr;</a></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Gaji Belum Diposting ke Kas</div>
          <div class="stat-value">${unpostedPayrollCount} <span style="font-size: 12px; font-weight: normal;">entri</span></div>
          <div style="margin-top: 8px;"><a href="${adminPrefix}/gaji" style="font-size: 11px;">Posting Gaji &rarr;</a></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Kritik/Saran Belum Dibalas</div>
          <div class="stat-value">${unrepliedFeedbackCount} <span style="font-size: 12px; font-weight: normal;">aspirasi</span></div>
          <div style="margin-top: 8px;"><a href="${orgPrefix}/saran" style="font-size: 11px;">Balas Saran &rarr;</a></div>
        </div>
      </div>
    `;
  } else if (subTab === 'kas') {
    // KAS & PROOF MANAGEMENT
    const txRows = transactions.map((t, idx) => {
      return `
        <tr>
          <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
          <td class="tabular" style="white-space: nowrap;">${formatDate(t.tx_date)}</td>
          <td>
            <strong>${escapeHtml(t.description)}</strong>
            ${t.proof_url ? `<div style="font-size: 11px;"><a href="${escapeHtml(t.proof_url)}" target="_blank" rel="noopener">Buka Tautan Bukti &rarr;</a></div>` : ''}
          </td>
          <td><span class="badge badge-muted">${escapeHtml(t.category)}</span></td>
          <td class="num tabular ${t.type === 'income' ? 'income' : ''}">${t.type === 'income' ? formatRupiah(t.amount) : '-'}</td>
          <td class="num tabular ${t.type === 'expense' ? 'expense' : ''}">${t.type === 'expense' ? formatRupiah(t.amount) : '-'}</td>
          <td style="text-align: center;">
            <form method="POST" action="${adminPrefix}/kas/${t.id}/proof" style="display: flex; flex-direction: column; gap: 4px;">
              <select name="proof_status" class="form-control" style="font-size: 11px; padding: 2px 4px;">
                <option value="lengkap" ${t.proof_status === 'lengkap' ? 'selected' : ''}>Lengkap [OK]</option>
                <option value="menunggu_verifikasi" ${t.proof_status === 'menunggu_verifikasi' ? 'selected' : ''}>Menunggu Verifikasi</option>
                <option value="belum_ada" ${t.proof_status === 'belum_ada' ? 'selected' : ''}>Belum Ada Bukti</option>
              </select>
              <input type="text" name="proof_url" value="${escapeHtml(t.proof_url || '')}" placeholder="URL Bukti (Drive/Foto)" class="form-control" style="font-size: 10px; padding: 2px 4px;">
              <button type="submit" class="btn btn-sm" style="margin-top: 2px;">Simpan Status</button>
            </form>
          </td>
          <td style="text-align: center;">
            ${!isAuditor && t.source_type === 'manual' ? `
              <form method="POST" action="${adminPrefix}/kas/${t.id}/delete" onsubmit="return confirm('Hapus transaksi manual ini?')">
                <button type="submit" class="link-btn" style="color: var(--ink-expense); font-size: 12px;">[Hapus]</button>
              </form>
            ` : `<span style="font-size: 12px; color: var(--ink-muted);">${t.source_type === 'manual' ? 'Read-Only' : 'Auto Gaji'}</span>`}
          </td>
        </tr>
      `;
    }).join('');

    const kasPeriodOptions = periods.map(p => `
      <option value="${p.id}" ${selectedPeriod?.id === p.id ? 'selected' : ''}>
        ${escapeHtml(p.name)}
      </option>
    `).join('');

    tabContent = `
      <!-- Form Tambah Transaksi Kas Manual (Hanya treasurer/org_admin) -->
      ${!isAuditor ? `
        <div class="form-panel">
          <h3 class="form-title">Catat Transaksi Kas Baru</h3>
          <form method="POST" action="${adminPrefix}/kas" onsubmit="return validateKasForm(this)">
            <div class="form-grid">
              <div class="form-group">
                <label for="kas_period_id">Periode Kas</label>
                <select id="kas_period_id" name="period_id" class="form-control">
                  <option value="">-- Umum / Lintas Periode --</option>
                  ${kasPeriodOptions}
                </select>
              </div>
              <div class="form-group">
                <label for="kas_tx_date">Tanggal Transaksi *</label>
                <input id="kas_tx_date" type="date" name="tx_date" class="form-control" value="${new Date().toISOString().slice(0, 10)}" required>
              </div>
              <div class="form-group">
                <label for="kas_type">Jenis Mutasi *</label>
                <select id="kas_type" name="type" class="form-control" required>
                  <option value="expense">Pengeluaran (Kas Keluar)</option>
                  <option value="income">Pemasukan (Kas Masuk)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="kas_category">Kategori *</label>
                <select id="kas_category" name="category" class="form-control" required>
                  <option value="Operasional">Operasional</option>
                  <option value="Konsumsi">Konsumsi</option>
                  <option value="Logistik">Logistik</option>
                  <option value="Dana Kampus">Dana Kampus / Fakultas</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div class="form-group">
                <label for="kas_amount">Nominal (Rupiah) *</label>
                <input id="kas_amount" type="number" name="amount" min="1" step="1" class="form-control mono" placeholder="100000" required>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label for="kas_description">Keterangan Transaksi *</label>
                <input id="kas_description" type="text" name="description" class="form-control" placeholder="Contoh: Pembelian spidol whiteboard &amp; modul lab" required>
              </div>
              <div class="form-group">
                <label for="kas_proof_url">Tautan Bukti Nota / Kwitansi (Opsional)</label>
                <input id="kas_proof_url" type="url" name="proof_url" class="form-control" placeholder="https://drive.google.com/...">
              </div>
              <div class="form-group">
                <label for="kas_proof_status">Status Bukti</label>
                <select id="kas_proof_status" name="proof_status" class="form-control">
                  <option value="belum_ada">Belum Ada Bukti</option>
                  <option value="menunggu_verifikasi">Menunggu Verifikasi Pengawas</option>
                  <option value="lengkap">Lengkap</option>
                </select>
              </div>
            </div>
            <button type="submit" class="btn btn-primary">Simpan Transaksi Kas &rarr;</button>
          </form>
        </div>
        <script>
          function validateKasForm(form) {
            var amount = parseInt(form.amount.value || '0', 10);
            var url = (form.proof_url.value || '').trim();
            if (isNaN(amount) || amount <= 0) {
              showToast('error', 'Nominal transaksi harus lebih besar dari 0.');
              return false;
            }
            if (url && !url.startsWith('https://') && !url.startsWith('http://')) {
              showToast('error', 'URL Bukti harus diawali dengan http:// atau https://');
              return false;
            }
            return true;
          }
        </script>
      ` : '<div class="alert alert-warn" style="margin-bottom: 16px;">Mode Auditor (Read-Only): Anda dapat memverifikasi status bukti transaksi di bawah ini.</div>'}

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase;">Daftar Transaksi &amp; Verifikasi Bukti</h3>
        <span style="font-size: 12px; color: var(--ink-muted);">${transactions.length} Transaksi</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>Tanggal</th>
              <th>Keterangan</th>
              <th>Kategori</th>
              <th class="num">Masuk (Rp)</th>
              <th class="num">Keluar (Rp)</th>
              <th style="text-align: center; width: 200px;">Status &amp; Tautan Bukti</th>
              <th style="text-align: center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${txRows || `<tr><td colspan="8" style="padding: 0;">${renderEmptyState('Belum ada transaksi kas.')}</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  } else if (subTab === 'gaji') {
    // PAYROLL INPUT & TSV IMPORT
    const periodSelectOptions = periods.map(p => `
      <option value="${p.id}" ${selectedPeriod?.id === p.id ? 'selected' : ''}>
        ${escapeHtml(p.name)} (${p.status === 'locked' ? 'Terkunci' : 'Terbuka'})
      </option>
    `).join('');

    const classOptions = classes.map(c => `
      <option value="${c.id}" data-rate="${c.hourly_rate}">
        ${escapeHtml(c.code)} — ${escapeHtml(c.name)} (${formatRupiah(c.hourly_rate)}/jam)
      </option>
    `).join('');

    const entryRows = entries.map((e, idx) => `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td><strong>${escapeHtml(e.class_code)}</strong></td>
        <td>${escapeHtml(e.member_name)}</td>
        <td class="num tabular">${formatHours(e.hours)}</td>
        <td class="num tabular">${formatRupiah(e.gross_pay)}</td>
        <td class="num tabular">${formatRupiah(e.kas_deduction)}</td>
        <td class="num tabular">
          ${e.fine_amount > 0 ? `${formatRupiah(e.fine_amount)} <span style="font-size:10px; color:var(--ink-muted);">(${escapeHtml(e.fine_reason || '')})</span>` : '-'}
        </td>
        <td class="num tabular"><strong>${formatRupiah(e.net_pay)}</strong></td>
        <td style="text-align: center;">
          <span class="badge ${e.posted_to_kas ? 'badge-success' : 'badge-warn'}">
            ${e.posted_to_kas ? 'Diposting' : 'Belum'}
          </span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          ${isAuditor ? '<span style="font-size:12px; color:var(--ink-muted);">Read-Only</span>' : (selectedPeriod?.status !== 'locked' ? `
            ${e.posted_to_kas ? `
              <form method="POST" action="${adminPrefix}/gaji/${e.id}/unpost" style="display:inline;" onsubmit="return confirm('Batalkan posting kas untuk entri ${escapeHtml(e.member_name)}?')">
                <input type="hidden" name="period_id" value="${selectedPeriod?.id || ''}">
                <button type="submit" class="link-btn" style="color: var(--ink-warn); font-size: 12px;">[Batal Post]</button>
              </form>
            ` : `
              <form method="POST" action="${adminPrefix}/gaji/${e.id}/delete" style="display:inline;" onsubmit="return confirm('Hapus entri ini?')">
                <input type="hidden" name="period_id" value="${selectedPeriod?.id || ''}">
                <button type="submit" class="link-btn" style="color: var(--ink-expense); font-size: 12px;">[Hapus]</button>
              </form>
            `}
          ` : '<span style="font-size:12px; color:var(--ink-muted);">Locked</span>')}
        </td>
      </tr>
    `).join('');

    tabContent = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 15px; font-weight: 700; text-transform: uppercase;">Manajemen Gaji Periode: ${escapeHtml(selectedPeriod?.name || '')}</h3>
          <span style="font-size: 12px; color: var(--ink-muted);">${entries.length} entri gaji terdaftar.</span>
        </div>
        <form method="GET" action="${adminPrefix}/gaji" style="display: flex; gap: 6px; align-items: center;">
          <label style="font-size: 12px; font-weight: 600;">Pilih Periode:</label>
          <select name="period" class="form-control" style="width: auto; padding: 4px 8px;" onchange="this.form.submit()">
            ${periodSelectOptions}
          </select>
        </form>
      </div>

      ${!isAuditor ? `
      <!-- Quick Action Buttons: Post All / Unpost -->
      <div style="display: flex; gap: 8px; margin-bottom: 16px;">
        <form method="POST" action="${adminPrefix}/gaji/post-all">
          <input type="hidden" name="period_id" value="${selectedPeriod?.id || ''}">
          <button type="submit" class="btn btn-primary" ${selectedPeriod?.status === 'locked' ? 'disabled' : ''}>
            [ 1-Klik: Posting Semua Periode Ini ke Buku Kas ]
          </button>
        </form>
      </div>

      <!-- Input Gaji Satuan & Import CSV/TSV Tabs -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px;">
        <!-- Form Satuan -->
        <div class="form-panel">
          <h4 class="form-title">Input Entri Gaji Satuan</h4>
          <form method="POST" action="${adminPrefix}/gaji/add" onsubmit="return validateSinglePayrollForm(this)">
            <input type="hidden" name="period_id" value="${selectedPeriod?.id || ''}">
            <div class="form-group">
              <label for="single_class_id">Pilih Kelas / Prodi *</label>
              <select name="class_id" id="single_class_id" class="form-control" required onchange="calculateSinglePayroll()">
                <option value="">-- Pilih Kelas --</option>
                ${classOptions}
              </select>
            </div>
            <div class="form-group">
              <label for="single_member_name">Nama Mahasiswa / Anggota *</label>
              <input id="single_member_name" type="text" name="member_name" class="form-control" required placeholder="Nama Lengkap">
            </div>
            <div class="form-group">
              <label for="single_hours">Jumlah Jam Kerja * (Bisa desimal, misal 2.5)</label>
              <input type="number" name="hours" id="single_hours" step="0.1" min="0" class="form-control mono" required oninput="calculateSinglePayroll()" placeholder="7.5">
            </div>
            <div class="form-group">
              <label for="single_deduction_mode">Potongan Kas</label>
              <select name="kas_deduction_mode" id="single_deduction_mode" class="form-control" onchange="calculateSinglePayroll()">
                <option value="auto">Otomatis (${org.deduction_mode === 'auto_percent' ? `${org.deduction_value}%` : (org.deduction_mode === 'auto_fixed' ? formatRupiah(org.deduction_value) : 'Manual Rp0')})</option>
                <option value="manual">Manual (Ketik Sendiri)</option>
              </select>
              <input type="number" name="manual_kas_deduction" id="single_manual_deduction" min="0" class="form-control mono" style="margin-top: 4px; display: none;" placeholder="Nominal Potongan Kas (Rp)" oninput="calculateSinglePayroll()">
            </div>
            <div class="form-group">
              <label for="single_fine_amount">Denda (Jika ada)</label>
              <input type="number" name="fine_amount" id="single_fine_amount" min="0" class="form-control mono" placeholder="0" oninput="calculateSinglePayroll()">
              <input type="text" name="fine_reason" class="form-control" style="margin-top: 4px;" placeholder="Alasan denda (misal: Telat piket)">
            </div>

            <!-- Live Calculation Preview -->
            <div style="background-color: var(--bg-header); padding: 8px; margin-bottom: 12px; font-size: 12px; border: 1px solid var(--border-grid);">
              <div>Bruto: <strong class="mono" id="prev_gross">Rp0</strong></div>
              <div>Potongan Kas: <strong class="mono" id="prev_deduction">Rp0</strong></div>
              <div>Denda: <strong class="mono" id="prev_fine">Rp0</strong></div>
              <div style="font-size: 13px; margin-top: 4px;">Gaji Bersih: <strong class="mono" style="color: var(--ink-income);" id="prev_net">Rp0</strong></div>
            </div>

            <button type="submit" class="btn btn-primary" ${selectedPeriod?.status === 'locked' ? 'disabled' : ''}>+ Simpan Entri Gaji</button>
          </form>
        </div>

        <!-- Form Import CSV/TSV Cepat dari Excel -->
        <div class="form-panel">
          <h4 class="form-title">Import Cepat Copy-Paste dari Spreadsheet / Excel</h4>
          <p style="font-size: 12px; color: var(--ink-muted); margin-bottom: 8px;">
            Copy langsung 3 kolom dari Excel/Sheets dan paste di bawah: <br>
            Format baris: <span class="mono">KODE_KELAS, NAMA, JAM</span> (Bisa pemisah Tab, Titik Koma, atau Koma).
          </p>
          <form method="POST" action="${adminPrefix}/gaji/import">
            <input type="hidden" name="period_id" value="${selectedPeriod?.id || ''}">
            <div class="form-group">
              <label for="import_csv_data">Data Spreadsheet (TSV / CSV) *</label>
              <textarea id="import_csv_data" name="csv_data" rows="8" class="form-control" placeholder="TE&#9;John Doe&#9;12.5&#10;TE INTER&#9;Jane Smith&#9;5" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary" ${selectedPeriod?.status === 'locked' ? 'disabled' : ''}>Import Data Spreadsheet &rarr;</button>
          </form>
        </div>
      </div>

      <script>
        const ORG_DEDUCTION_MODE = ${JSON.stringify(org.deduction_mode)};
        const ORG_DEDUCTION_VALUE = ${Number(org.deduction_value) || 0};

        function calculateSinglePayroll() {
          const classSelect = document.getElementById('single_class_id');
          const opt = classSelect.options[classSelect.selectedIndex];
          const rate = opt ? parseInt(opt.getAttribute('data-rate') || '0', 10) : 0;
          const hours = parseFloat(document.getElementById('single_hours').value || '0') || 0;
          const gross = Math.round(hours * rate);

          const dedModeSelect = document.getElementById('single_deduction_mode');
          const manualInput = document.getElementById('single_manual_deduction');

          let ded = 0;
          if (dedModeSelect.value === 'manual') {
            manualInput.style.display = 'block';
            ded = Math.max(0, parseInt(manualInput.value || '0', 10) || 0);
          } else {
            manualInput.style.display = 'none';
            if (ORG_DEDUCTION_MODE === 'auto_percent') {
              ded = Math.round(gross * (ORG_DEDUCTION_VALUE / 100));
            } else if (ORG_DEDUCTION_MODE === 'auto_fixed') {
              ded = Math.min(gross, Math.round(ORG_DEDUCTION_VALUE));
            } else {
              ded = 0;
            }
          }

          const fine = Math.max(0, parseInt(document.getElementById('single_fine_amount').value || '0', 10) || 0);
          const net = Math.max(0, gross - ded - fine);

          document.getElementById('prev_gross').innerText = 'Rp' + gross.toLocaleString('id-ID');
          document.getElementById('prev_deduction').innerText = 'Rp' + ded.toLocaleString('id-ID');
          document.getElementById('prev_fine').innerText = 'Rp' + fine.toLocaleString('id-ID');
          document.getElementById('prev_net').innerText = 'Rp' + net.toLocaleString('id-ID');
        }

        function validateSinglePayrollForm(form) {
          var hours = parseFloat(form.hours.value || '0');
          var fine = parseInt(form.fine_amount.value || '0', 10) || 0;
          if (isNaN(hours) || hours <= 0) {
            showToast('error', 'Jumlah jam kerja harus lebih besar dari 0.');
            return false;
          }
          if (fine < 0) {
            showToast('error', 'Nominal denda tidak boleh bernilai negatif.');
            return false;
          }
          return true;
        }
      </script>
      ` : '<div class="alert alert-warn" style="margin-bottom: 16px;">Mode Auditor (Read-Only): Anda dapat meninjau rincian honorarium periode ini.</div>'}

      <!-- Entries Table -->
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>Kelas</th>
              <th>Nama Mahasiswa</th>
              <th class="num">Jam</th>
              <th class="num">Bruto</th>
              <th class="num">Kas</th>
              <th class="num">Denda</th>
              <th class="num">Bersih</th>
              <th style="text-align: center;">Status Kas</th>
              <th style="text-align: center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${entryRows || `<tr><td colspan="10" style="padding: 0;">${renderEmptyState('Belum ada entri honorarium / gaji pada periode ini.')}</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  } else if (subTab === 'classes') {
    // DYNAMIC CLASSES MANAGEMENT
    const classRows = classes.map((c, idx) => `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td><strong>${escapeHtml(c.code)}</strong></td>
        <td>${escapeHtml(c.name)}</td>
        <td class="num tabular">${formatRupiah(c.hourly_rate)}</td>
        <td>${c.merge_group ? `<span class="badge badge-muted">${escapeHtml(c.merge_group)}</span>` : '-'}</td>
        <td style="text-align: center;">
          <span class="badge ${c.is_active ? 'badge-success' : 'badge-danger'}">${c.is_active ? 'Aktif' : 'Nonaktif'}</span>
        </td>
        <td style="text-align: center;">
          ${!isAuditor ? `
            <form method="POST" action="${adminPrefix}/classes/${c.id}/delete" style="display:inline;" onsubmit="return confirm('Nonaktifkan / Hapus kelas ini?')">
              <button type="submit" class="link-btn" style="font-size: 12px;">[Hapus / Nonaktifkan]</button>
            </form>
          ` : '<span style="font-size: 12px; color: var(--ink-muted);">Read-Only</span>'}
        </td>
      </tr>
    `).join('');

    tabContent = `
      ${!isAuditor ? `
        <div class="form-panel">
          <h4 class="form-title">Tambah Kelas / Program Studi Dinamis</h4>
          <form method="POST" action="${adminPrefix}/classes">
            <div class="form-grid">
              <div class="form-group">
                <label for="cls_code">Kode Kelas * (Contoh: TE, TSE, TE INTER, DIV-ACARA)</label>
                <input id="cls_code" type="text" name="code" class="form-control mono" required placeholder="TSE" style="text-transform: uppercase;">
              </div>
              <div class="form-group">
                <label for="cls_name">Nama Lengkap Kelas / Divisi *</label>
                <input id="cls_name" type="text" name="name" class="form-control" required placeholder="Teknik Sistem Energi">
              </div>
              <div class="form-group">
                <label for="cls_rate">Tarif Honorarium per Jam (Rp) *</label>
                <input id="cls_rate" type="number" name="hourly_rate" min="0" step="500" class="form-control mono" required placeholder="13500">
              </div>
              <div class="form-group">
                <label for="cls_merge">Merge Group (Opsional, misal: TE_COMBINED)</label>
                <input id="cls_merge" type="text" name="merge_group" class="form-control mono" placeholder="TE_COMBINED">
              </div>
            </div>
            <button type="submit" class="btn btn-primary">+ Tambah Kelas Baru</button>
          </form>
        </div>
      ` : '<div class="alert alert-warn" style="margin-bottom: 16px;">Mode Auditor (Read-Only): Daftar kelas dan tarif honorarium organisasi.</div>'}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>Kode</th>
              <th>Nama Program Studi / Divisi</th>
              <th class="num">Tarif / Jam</th>
              <th>Merge Group</th>
              <th style="text-align: center;">Status</th>
              <th style="text-align: center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${classRows}
          </tbody>
        </table>
      </div>
    `;
  } else if (subTab === 'periods') {
    // PERIODS MANAGEMENT
    const periodRows = periods.map((p, idx) => `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td class="tabular">${formatDate(p.start_date)} s/d ${formatDate(p.end_date)}</td>
        <td style="text-align: center;">
          <span class="badge ${p.status === 'locked' ? 'badge-danger' : (p.status === 'open' ? 'badge-success' : 'badge-warn')}">
            ${p.status.toUpperCase()}
          </span>
        </td>
        <td style="text-align: center;">
          ${isOrgAdminOrSuper ? `
            <form method="POST" action="${adminPrefix}/periods/${p.id}/toggle-lock" style="display:inline;" onsubmit="return confirm('${p.status === 'locked' ? 'Buka kunci' : 'Tutup buku (kunci)'} periode ${escapeHtml(p.name)}?')">
              <button type="submit" class="btn btn-sm">
                ${p.status === 'locked' ? '[ Buka Kunci (Unlock) ]' : '[ Tutup Buku (Lock) ]'}
              </button>
            </form>
          ` : '<span style="font-size:11px; color:var(--ink-muted);">Hanya Org Admin</span>'}
        </td>
      </tr>
    `).join('');

    tabContent = `
      ${!isAuditor ? `
        <div class="form-panel">
          <h4 class="form-title">Buat Periode Baru</h4>
          <form method="POST" action="${adminPrefix}/periods">
            <div class="form-grid">
              <div class="form-group">
                <label for="per_name">Nama Periode * (Contoh: Periode 1, Periode 2)</label>
                <input id="per_name" type="text" name="name" class="form-control" required placeholder="Periode 2">
              </div>
              <div class="form-group">
                <label for="per_start">Tanggal Mulai</label>
                <input id="per_start" type="date" name="start_date" class="form-control">
              </div>
              <div class="form-group">
                <label for="per_end">Tanggal Selesai</label>
                <input id="per_end" type="date" name="end_date" class="form-control">
              </div>
            </div>
            <button type="submit" class="btn btn-primary">+ Buat Periode Baru</button>
          </form>
        </div>
      ` : '<div class="alert alert-warn" style="margin-bottom: 16px;">Mode Auditor (Read-Only): Daftar periode penggajian dan status tutup buku.</div>'}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>Nama Periode</th>
              <th>Rentang Tanggal</th>
              <th style="text-align: center;">Status</th>
              <th style="text-align: center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${periodRows}
          </tbody>
        </table>
      </div>
    `;
  } else if (subTab === 'settings') {
    // SETTINGS & ACCOUNT MANAGEMENT (Org Admin & Super Admin only)
    const memberRows = memberships.map((m, idx) => `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td><strong>${escapeHtml(m.user_email)}</strong></td>
        <td>${escapeHtml(m.user_name || '-')}</td>
        <td>
          <form method="POST" action="${adminPrefix}/members/${m.id}/role" style="display:inline-flex; gap:4px;">
            <select name="role" class="form-control" style="font-size: 11px; padding: 2px 4px;">
              <option value="member" ${m.role === 'member' ? 'selected' : ''}>member</option>
              <option value="auditor" ${m.role === 'auditor' ? 'selected' : ''}>auditor</option>
              <option value="treasurer" ${m.role === 'treasurer' ? 'selected' : ''}>treasurer</option>
              <option value="org_admin" ${m.role === 'org_admin' ? 'selected' : ''}>org_admin</option>
            </select>
            <button type="submit" class="btn btn-sm">Ubah</button>
          </form>
        </td>
        <td style="text-align: center;">
          <form method="POST" action="${adminPrefix}/members/${m.id}/delete" onsubmit="return confirm('Keluarkan anggota ini dari organisasi?')">
            <button type="submit" class="link-btn" style="color: var(--ink-expense); font-size: 11px;">[Keluarkan]</button>
          </form>
        </td>
      </tr>
    `).join('');

    tabContent = `
      <!-- Alamat Publik & Subdomain Organisasi -->
      <div class="form-panel">
        <h4 class="form-title">Alamat Publik &amp; Subdomain Organisasi</h4>
        <div style="margin-bottom: 12px; font-size: 13px;">
          Tautan Aktif Saat Ini: 
          <strong><a href="https://${escapeHtml(org.subdomain)}.${escapeHtml(baseDomain)}" target="_blank" rel="noopener">https://${escapeHtml(org.subdomain)}.${escapeHtml(baseDomain)}</a></strong>
        </div>
        ${org.allow_admin_subdomain_edit || isSuperAdmin ? `
          <form method="POST" action="${adminPrefix}/subdomain" style="max-width: 500px;">
            <div class="form-group">
              <label for="set_subdomain">Ubah Subdomain Organisasi</label>
              <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                <input id="set_subdomain" type="text" name="subdomain" value="${escapeHtml(org.subdomain)}" class="form-control mono" required style="max-width: 200px;">
                <span class="mono">.${escapeHtml(baseDomain)}</span>
                <button type="submit" class="btn btn-primary btn-sm" style="margin-left: 8px;">Simpan Subdomain</button>
              </div>
              <p style="font-size: 12px; color: var(--ink-muted); margin-top: 4px;">
                Mengubah subdomain akan langsung memindahkan alamat akses organisasi dan tautan lama akan otomatis diarahkan (301).
              </p>
            </div>
          </form>
        ` : '<p style="font-size: 11px; color: var(--ink-muted);">Pengubahan subdomain dikunci oleh Super Admin.</p>'}
      </div>

      <!-- General Org Settings -->
      <div class="form-panel">
        <h4 class="form-title">Pengaturan Umum &amp; Aturan Kas Organisasi</h4>
        <form method="POST" action="${adminPrefix}/settings">
          <div class="form-grid">
            <div class="form-group">
              <label for="set_name">Nama Resmi Organisasi *</label>
              <input id="set_name" type="text" name="name" value="${escapeHtml(org.name)}" class="form-control" required>
            </div>
            <div class="form-group">
              <label for="set_short_code">Singkatan (Kode Singkat)</label>
              <input id="set_short_code" type="text" name="short_code" value="${escapeHtml(org.short_code || '')}" class="form-control">
            </div>
            <div class="form-group">
              <label for="set_is_public">Visibilitas Portal</label>
              <select id="set_is_public" name="is_public" class="form-control">
                <option value="1" ${org.is_public ? 'selected' : ''}>Publik (Bisa Dilihat Tanpa Login)</option>
                <option value="0" ${!org.is_public ? 'selected' : ''}>Privat (Khusus Anggota Terdaftar)</option>
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label for="set_deduction_mode">Mode Potongan Kas Default</label>
              <select id="set_deduction_mode" name="deduction_mode" class="form-control">
                <option value="auto_percent" ${org.deduction_mode === 'auto_percent' ? 'selected' : ''}>Persentase Otomatis (%)</option>
                <option value="auto_fixed" ${org.deduction_mode === 'auto_fixed' ? 'selected' : ''}>Nominal Tetap (Rp)</option>
                <option value="manual" ${org.deduction_mode === 'manual' ? 'selected' : ''}>Manual (Diisi Saat Input Gaji)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="set_deduction_value">Nilai Potongan Default (Persen atau Rupiah)</label>
              <input id="set_deduction_value" type="number" step="0.1" min="0" name="deduction_value" value="${org.deduction_value}" class="form-control mono">
            </div>
            <div class="form-group">
              <label for="set_cash_mode">Model Aliran Kas Gaji</label>
              <select id="set_cash_mode" name="payroll_cash_mode" class="form-control">
                <option value="deduction_only" ${org.payroll_cash_mode === 'deduction_only' ? 'selected' : ''}>Deduction Only (Gaji dari Kampus, Kas ambil potongan &amp; denda)</option>
                <option value="full_disbursement" ${org.payroll_cash_mode === 'full_disbursement' ? 'selected' : ''}>Full Disbursement (Gaji cair dari Kas Ormawa)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="set_post_grouping">Mode Posting Honorarium ke Buku Kas</label>
              <select id="set_post_grouping" name="payroll_post_grouping" class="form-control">
                <option value="individual" ${(org.payroll_post_grouping || 'individual') === 'individual' ? 'selected' : ''}>Per Anggota (Individual Line Items)</option>
                <option value="batch_recap" ${org.payroll_post_grouping === 'batch_recap' ? 'selected' : ''}>Rekap Gabungan per Periode (Batch Recap)</option>
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn-primary">Simpan Pengaturan Organisasi</button>
        </form>
      </div>

      <!-- Akun & Keanggotaan Internal Organisasi -->
      <div class="form-panel">
        <h4 class="form-title">Manajemen Akun Internal Organisasi</h4>
        <form method="POST" action="${adminPrefix}/members" style="margin-bottom: 16px;">
          <div class="form-grid">
            <div class="form-group">
              <label>Email Google Anggota * (Pre-Invite didukung!)</label>
              <input type="email" name="email" class="form-control" placeholder="nama@gmail.com" required>
            </div>
            <div class="form-group">
              <label>Peran / Role di Organisasi Ini *</label>
              <select name="role" class="form-control" required>
                <option value="member">member (Anggota)</option>
                <option value="auditor">auditor (Pengawas / DPM)</option>
                <option value="treasurer">treasurer (Bendahara)</option>
                <option value="org_admin">org_admin (Admin Organisasi)</option>
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn-primary">+ Tambah / Assign Akun</button>
        </form>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">No</th>
                <th>Email Google</th>
                <th>Nama</th>
                <th>Role Saat Ini</th>
                <th style="text-align: center;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${memberRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  return `
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 16px; font-weight: 700; text-transform: uppercase;">Workspace Pengelola Organisasi</h2>
      <span style="font-size: 12px; color: var(--ink-muted);">Organisasi: <strong>${escapeHtml(org.name)}</strong></span>
    </div>
    ${navHtml}
    ${tabContent}
  `;
}
