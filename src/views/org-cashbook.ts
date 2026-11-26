import { escapeHtml, formatRupiah, formatDate, renderEmptyState } from '../lib/format';
import type { Organization, Period, CashTransaction } from '../types';

export interface OrgCashbookPageData {
  org: Organization;
  periods: Period[];
  selectedPeriod: Period | null;
  selectedType: string;
  selectedProofStatus: string;
  transactions: CashTransaction[];
  totalIncome: number;
  totalExpense: number;
  currentBalance: number;
  filteredIncome: number;
  filteredExpense: number;
  isFiltered: boolean;
  isSubdomainHost?: boolean;
}

export function renderOrgCashbookPage(data: OrgCashbookPageData): string {
  const { org, periods, selectedPeriod, selectedType, selectedProofStatus, transactions, totalIncome, totalExpense, currentBalance, filteredIncome, filteredExpense, isFiltered, isSubdomainHost } = data;
  const orgPrefix = isSubdomainHost ? '' : `/org/${org.slug}`;

  const periodOptions = periods.map(p => `
    <option value="${p.id}" ${selectedPeriod?.id === p.id ? 'selected' : ''}>
      ${escapeHtml(p.name)}
    </option>
  `).join('');

  const rows = transactions.map((t, idx) => {
    let proofCell = '';
    if (t.proof_status === 'lengkap') {
      proofCell = t.proof_url
        ? `<a href="${escapeHtml(t.proof_url)}" target="_blank" rel="noopener" class="badge badge-success">Lihat Bukti [OK]</a>`
        : `<span class="badge badge-success">Lengkap (Internal)</span>`;
    } else if (t.proof_status === 'menunggu_verifikasi') {
      proofCell = t.proof_url
        ? `<a href="${escapeHtml(t.proof_url)}" target="_blank" rel="noopener" class="badge badge-warn">Verifikasi Bukti [?]</a>`
        : `<span class="badge badge-warn">Menunggu Nota</span>`;
    } else {
      proofCell = `<span class="badge badge-danger">Belum Ada Bukti</span>`;
    }

    return `
      <tr>
        <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
        <td class="tabular" style="white-space: nowrap;">${formatDate(t.tx_date)}</td>
        <td class="sticky-col">
          <strong>${escapeHtml(t.description)}</strong>
          ${t.source_type !== 'manual' ? `<span style="font-size: 11px; color: var(--ink-muted); display: block;">[Otomatis: ${escapeHtml(t.source_type)}]</span>` : ''}
        </td>
        <td><span class="badge badge-muted">${escapeHtml(t.category)}</span></td>
        <td class="num tabular ${t.type === 'income' ? 'income' : ''}">
          ${t.type === 'income' ? formatRupiah(t.amount) : '-'}
        </td>
        <td class="num tabular ${t.type === 'expense' ? 'expense' : ''}">
          ${t.type === 'expense' ? formatRupiah(t.amount) : '-'}
        </td>
        <td class="num tabular">
          <strong>${t.running_balance !== undefined ? formatRupiah(t.running_balance) : '-'}</strong>
        </td>
        <td style="text-align: center;">
          ${proofCell}
        </td>
      </tr>
    `;
  }).join('');

  const exportUrl = `${orgPrefix}/export/kas.csv?period=${selectedPeriod?.id || 'all'}&type=${selectedType}&proof=${selectedProofStatus}`;

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
      <div>
        <h2 style="font-size: 16px; font-weight: 700; text-transform: uppercase;">Buku Kas Terbuka &amp; Status Bukti Transaksi</h2>
        <span style="font-size: 12px; color: var(--ink-muted);">Catatan kronologis mutasi kas organisasi beserta saldo berjalan.</span>
      </div>
      <div>
        <a href="${exportUrl}" class="btn">[ Export CSV Kas ]</a>
        <button onclick="window.print()" class="btn btn-primary" style="margin-left: 6px;">[ Cetak Buku Kas ]</button>
      </div>
    </div>

    <!-- Summary Strip -->
    <div class="summary-strip">
      <div class="stat-box">
        <div class="stat-label">${isFiltered ? 'Pemasukan (Filter Ini)' : 'Total Pemasukan Kas'}</div>
        <div class="stat-value income">${formatRupiah(isFiltered ? filteredIncome : totalIncome)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">${isFiltered ? 'Pengeluaran (Filter Ini)' : 'Total Pengeluaran Kas'}</div>
        <div class="stat-value expense">${formatRupiah(isFiltered ? filteredExpense : totalExpense)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Saldo Kas Keseluruhan</div>
        <div class="stat-value balance">${formatRupiah(currentBalance)}</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="form-panel no-print" style="padding: 10px 14px; margin-bottom: 16px;">
      <form method="GET" action="${orgPrefix}/kas" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
        <div style="display: flex; gap: 6px; align-items: center;">
          <label for="kas_filter_period" style="font-size: 12px; font-weight: 600;">Periode:</label>
          <select id="kas_filter_period" name="period" class="form-control" style="width: auto; padding: 4px 8px;" onchange="this.form.submit()">
            <option value="all">Semua Periode</option>
            ${periodOptions}
          </select>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <label for="kas_filter_type" style="font-size: 12px; font-weight: 600;">Jenis:</label>
          <select id="kas_filter_type" name="type" class="form-control" style="width: auto; padding: 4px 8px;" onchange="this.form.submit()">
            <option value="all" ${selectedType === 'all' ? 'selected' : ''}>Semua Jenis</option>
            <option value="income" ${selectedType === 'income' ? 'selected' : ''}>Pemasukan Saja</option>
            <option value="expense" ${selectedType === 'expense' ? 'selected' : ''}>Pengeluaran Saja</option>
          </select>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <label for="kas_filter_proof" style="font-size: 12px; font-weight: 600;">Status Bukti:</label>
          <select id="kas_filter_proof" name="proof" class="form-control" style="width: auto; padding: 4px 8px;" onchange="this.form.submit()">
            <option value="all" ${selectedProofStatus === 'all' ? 'selected' : ''}>Semua Status</option>
            <option value="lengkap" ${selectedProofStatus === 'lengkap' ? 'selected' : ''}>Lengkap</option>
            <option value="menunggu_verifikasi" ${selectedProofStatus === 'menunggu_verifikasi' ? 'selected' : ''}>Menunggu Verifikasi</option>
            <option value="belum_ada" ${selectedProofStatus === 'belum_ada' ? 'selected' : ''}>Belum Ada Bukti</option>
          </select>
        </div>
      </form>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">No</th>
            <th>Tanggal</th>
            <th class="sticky-col">Keterangan Transaksi</th>
            <th>Kategori</th>
            <th class="num">Masuk (Rp)</th>
            <th class="num">Keluar (Rp)</th>
            <th class="num">Saldo Berjalan</th>
            <th style="text-align: center;">Status Bukti</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" style="padding: 0;">${renderEmptyState('Belum ada riwayat transaksi kas pada kriteria ini.')}</td></tr>`}
          <tr class="total-row">
            <td colspan="4" style="text-align: center;">${isFiltered ? 'TOTAL FILTER INI' : 'TOTAL KAS'}</td>
            <td class="num tabular">${formatRupiah(filteredIncome)}</td>
            <td class="num tabular">${formatRupiah(filteredExpense)}</td>
            <td class="num tabular"><strong>${formatRupiah(isFiltered ? (filteredIncome - filteredExpense) : currentBalance)}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
