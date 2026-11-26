import { escapeHtml, formatRupiah, formatDate, renderEmptyState } from '../lib/format';
import type { Organization, Period, CashTransaction, Feedback } from '../types';

export interface ClassRecapItem {
  code: string;
  name: string;
  member_count: number;
  total_hours: number;
  total_gross: number;
  total_kas_deduction: number;
  total_fine: number;
  total_net: number;
}

export interface OrgDashboardData {
  org: Organization;
  periods: Period[];
  selectedPeriod: Period | null;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  proofStats: {
    total: number;
    complete: number;
    percent: number;
  };
  classRecaps: ClassRecapItem[];
  recentTransactions: CashTransaction[];
  recentFeedbacks: Feedback[];
  isSubdomainHost?: boolean;
}

export function renderOrgDashboard(data: OrgDashboardData): string {
  const { org, periods, selectedPeriod, totalIncome, totalExpense, balance, proofStats, classRecaps, recentTransactions, recentFeedbacks, isSubdomainHost } = data;
  const orgPrefix = isSubdomainHost ? '' : `/org/${org.slug}`;

  // Period Selector Form
  const periodOptions = periods.map(p => `
    <option value="${p.id}" ${selectedPeriod?.id === p.id ? 'selected' : ''}>
      ${escapeHtml(p.name)} (${p.status === 'locked' ? 'Tutup Buku / Terkunci' : (p.status === 'open' ? 'Terbuka' : 'Draft')})
    </option>
  `).join('');

  // Class Recap Table
  let grandMembers = 0;
  let grandHours = 0;
  let grandGross = 0;
  let grandDeduction = 0;
  let grandFine = 0;
  let grandNet = 0;

  const classRows = classRecaps.map((c, idx) => {
    grandMembers += c.member_count;
    grandHours += c.total_hours;
    grandGross += c.total_gross;
    grandDeduction += c.total_kas_deduction;
    grandFine += c.total_fine;
    grandNet += c.total_net;

    return `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td><strong>${escapeHtml(c.code)}</strong> — ${escapeHtml(c.name)}</td>
        <td class="num tabular">${c.member_count}</td>
        <td class="num tabular">${c.total_hours}</td>
        <td class="num tabular">${formatRupiah(c.total_gross)}</td>
        <td class="num tabular">${formatRupiah(c.total_kas_deduction)}</td>
        <td class="num tabular">${formatRupiah(c.total_fine)}</td>
        <td class="num tabular"><strong>${formatRupiah(c.total_net)}</strong></td>
      </tr>
    `;
  }).join('');

  const txRows = recentTransactions.slice(0, 5).map((t, idx) => {
    const proofBadge = t.proof_status === 'lengkap'
      ? `<span class="badge badge-success">Lengkap</span>`
      : (t.proof_status === 'menunggu_verifikasi'
        ? `<span class="badge badge-warn">Menunggu Verifikasi</span>`
        : `<span class="badge badge-danger">Belum Ada Bukti</span>`);

    return `
      <tr>
        <td class="tabular">${formatDate(t.tx_date)}</td>
        <td>${escapeHtml(t.description)}</td>
        <td><span class="badge badge-muted">${escapeHtml(t.category)}</span></td>
        <td class="num tabular ${t.type === 'income' ? 'income' : ''}">${t.type === 'income' ? formatRupiah(t.amount) : '-'}</td>
        <td class="num tabular ${t.type === 'expense' ? 'expense' : ''}">${t.type === 'expense' ? formatRupiah(t.amount) : '-'}</td>
        <td style="text-align: center;">${proofBadge}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
      <div>
        <h2 style="font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Ringkasan Keuangan Organisasi</h2>
        <span style="font-size: 12px; color: var(--ink-muted);">Periode Terpilih: <strong>${escapeHtml(selectedPeriod?.name || 'Semua Periode')}</strong></span>
      </div>
      <form method="GET" action="${orgPrefix}/" style="display: flex; gap: 6px; align-items: center;">
        <label for="period" style="font-size: 12px; font-weight: 600;">Pilih Periode:</label>
        <select name="period" id="period" class="form-control" style="width: auto; padding: 4px 8px;" onchange="this.form.submit()">
          <option value="all">Semua Periode</option>
          ${periodOptions}
        </select>
      </form>
    </div>

    <!-- Financial Strip -->
    <div class="summary-strip">
      <div class="stat-box">
        <div class="stat-label">Total Pemasukan Kas</div>
        <div class="stat-value income">${formatRupiah(totalIncome)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Total Pengeluaran Kas</div>
        <div class="stat-value expense">${formatRupiah(totalExpense)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Saldo Kas Saat Ini</div>
        <div class="stat-value balance">${formatRupiah(balance)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Kelengkapan Bukti Pengeluaran</div>
        <div class="stat-value ${proofStats.percent >= 80 ? 'income' : (proofStats.percent >= 50 ? '' : 'expense')}">
          ${proofStats.percent}% <span style="font-size: 12px; font-weight: normal; color: var(--ink-muted);">(${proofStats.complete}/${proofStats.total} tx)</span>
        </div>
      </div>
    </div>

    <!-- Section 1: Rekapitulasi Penggajian per Kelas/Prodi -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase;">Rekapitulasi Penggajian per Kelas / Prodi</h3>
      <a href="${orgPrefix}/gaji" style="font-size: 12px;">Lihat Rincian Lengkap &amp; Gabungan Kelas &rarr;</a>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">No</th>
            <th>Kelas / Program Studi</th>
            <th class="num">Anggota</th>
            <th class="num">Total Jam</th>
            <th class="num">Gaji Bruto</th>
            <th class="num">Potongan Kas</th>
            <th class="num">Denda</th>
            <th class="num">Gaji Bersih</th>
          </tr>
        </thead>
        <tbody>
          ${classRows || `<tr><td colspan="8" style="padding: 0;">${renderEmptyState('Belum ada data honorarium / gaji pada periode ini.')}</td></tr>`}
          ${classRecaps.length > 0 ? `
            <tr class="total-row">
              <td colspan="2" style="text-align: center;">TOTAL KESELURUHAN</td>
              <td class="num tabular">${grandMembers}</td>
              <td class="num tabular">${grandHours}</td>
              <td class="num tabular">${formatRupiah(grandGross)}</td>
              <td class="num tabular">${formatRupiah(grandDeduction)}</td>
              <td class="num tabular">${formatRupiah(grandFine)}</td>
              <td class="num tabular"><strong>${formatRupiah(grandNet)}</strong></td>
            </tr>
          ` : ''}
        </tbody>
      </table>
    </div>

    <!-- Section 2: Transaksi Kas Terbaru & Kritik/Saran Ringkas -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 10px;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase;">Transaksi Kas Terakhir</h3>
          <a href="${orgPrefix}/kas" style="font-size: 12px;">Lihat Buku Kas &rarr;</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Keterangan</th>
                <th>Kategori</th>
                <th class="num">Masuk</th>
                <th class="num">Keluar</th>
                <th style="text-align: center;">Bukti</th>
              </tr>
            </thead>
            <tbody>
              ${txRows || `<tr><td colspan="6" style="padding: 0;">${renderEmptyState('Belum ada transaksi kas.')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase;">Kritik &amp; Saran Masuk</h3>
          <a href="${orgPrefix}/saran" style="font-size: 12px;">Kirim Saran &rarr;</a>
        </div>
        <div class="form-panel" style="padding: 12px; font-size: 13px;">
          ${recentFeedbacks.length > 0 ? recentFeedbacks.slice(0, 3).map(f => `
            <div style="border-bottom: 1px solid var(--border-grid); padding-bottom: 8px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--ink-muted);">
                <strong>${escapeHtml(f.sender_name)}</strong>
                <span class="badge ${f.treasurer_reply ? 'badge-success' : 'badge-warn'}">${f.treasurer_reply ? 'Sudah Ditanggapi' : 'Menunggu Tanggapan'}</span>
              </div>
              <div style="margin: 4px 0;">"${escapeHtml(f.message)}"</div>
              ${f.treasurer_reply ? `
                <div style="background-color: var(--bg-header); padding: 4px 8px; font-size: 12px; border-left: 2px solid var(--border-strong);">
                  <strong>Tanggapan Bendahara:</strong> ${escapeHtml(f.treasurer_reply)}
                </div>
              ` : ''}
            </div>
          `).join('') : renderEmptyState('Belum ada kritik & saran yang dikirimkan.')}
        </div>
      </div>
    </div>
  `;
}
