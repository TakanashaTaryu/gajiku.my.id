import { escapeHtml, formatRupiah, formatHours, renderEmptyState } from '../lib/format';
import type { Organization, Period, PayrollEntry, OrgClass } from '../types';
import type { CombinedMergeGroupSummary } from '../services/payroll';
import type { ClassRecapItem } from './org-dashboard';

export interface OrgPayrollPageData {
  org: Organization;
  periods: Period[];
  selectedPeriod: Period | null;
  classes: OrgClass[];
  selectedClassCode: string | null;
  searchQuery: string;
  entries: PayrollEntry[];
  classRecaps: ClassRecapItem[];
  mergeGroupSummaries: CombinedMergeGroupSummary[];
  isSubdomainHost?: boolean;
}

export function renderOrgPayrollPage(data: OrgPayrollPageData): string {
  const { org, periods, selectedPeriod, classes, selectedClassCode, searchQuery, entries, classRecaps, mergeGroupSummaries, isSubdomainHost } = data;
  const orgPrefix = isSubdomainHost ? '' : `/org/${org.slug}`;

  // Period options
  const periodOptions = periods.map(p => `
    <option value="${p.id}" ${selectedPeriod?.id === p.id ? 'selected' : ''}>
      ${escapeHtml(p.name)} (${p.status === 'locked' ? 'Terkunci' : 'Aktif'})
    </option>
  `).join('');

  // Class filter options
  const classOptions = classes.map(c => `
    <option value="${escapeHtml(c.code)}" ${selectedClassCode === c.code ? 'selected' : ''}>
      ${escapeHtml(c.code)} — ${escapeHtml(c.name)}
    </option>
  `).join('');

  // 1. Recap Section
  let grandMembers = 0;
  let grandHours = 0;
  let grandGross = 0;
  let grandDeduction = 0;
  let grandFine = 0;
  let grandNet = 0;

  const recapRows = classRecaps.map((c, idx) => {
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
        <td class="num tabular">${formatHours(c.total_hours)}</td>
        <td class="num tabular">${formatRupiah(c.total_gross)}</td>
        <td class="num tabular">${formatRupiah(c.total_kas_deduction)}</td>
        <td class="num tabular">${formatRupiah(c.total_fine)}</td>
        <td class="num tabular"><strong>${formatRupiah(c.total_net)}</strong></td>
      </tr>
    `;
  }).join('');

  // 2. Merge Group Section (TE REG + INT)
  let mergeGroupsHtml = '';
  for (const mg of mergeGroupSummaries) {
    const classHeaders = mg.class_codes.map(cc => `
      <th class="num" style="background-color: #DFDCD1;">${escapeHtml(cc)} (Jam)</th>
      <th class="num" style="background-color: #DFDCD1;">${escapeHtml(cc)} (Bruto)</th>
    `).join('');

    const mgRows = mg.rows.map((r, idx) => {
      const classCols = mg.class_codes.map(cc => {
        const item = r.class_entries[cc];
        return `
          <td class="num tabular">${item ? formatHours(item.hours) : '-'}</td>
          <td class="num tabular">${item ? formatRupiah(item.gross) : '-'}</td>
        `;
      }).join('');

      return `
        <tr data-member-row data-member-name="${escapeHtml(r.member_name.toLowerCase())}">
          <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
          <td class="sticky-col"><strong>${escapeHtml(r.member_name)}</strong></td>
          ${classCols}
          <td class="num tabular"><strong>${formatRupiah(r.total_gross)}</strong></td>
          <td class="num tabular">${formatRupiah(r.total_kas_deduction)}</td>
          <td class="num tabular">${r.total_fine > 0 ? formatRupiah(r.total_fine) : '-'}</td>
          <td class="num tabular" style="background-color: var(--bg-income);"><strong>${formatRupiah(r.total_net)}</strong></td>
        </tr>
      `;
    }).join('');

    // Totals for classes
    const classTotalCols = mg.class_codes.map(cc => {
      let h = 0;
      let g = 0;
      for (const r of mg.rows) {
        if (r.class_entries[cc]) {
          h += r.class_entries[cc].hours;
          g += r.class_entries[cc].gross;
        }
      }
      return `
        <td class="num tabular">${formatHours(h)}</td>
        <td class="num tabular">${formatRupiah(g)}</td>
      `;
    }).join('');

    mergeGroupsHtml += `
      <div style="margin-top: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase;">
            Tabel Gabungan: ${escapeHtml(mg.merge_group)} (${mg.class_codes.join(' + ')})
          </h3>
          <span style="font-size: 11px; color: var(--ink-muted);">${mg.rows.length} Mahasiswa Pengampu</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">No</th>
                <th class="sticky-col">Nama Anggota</th>
                ${classHeaders}
                <th class="num">Total Bruto</th>
                <th class="num">Potongan Kas</th>
                <th class="num">Denda</th>
                <th class="num">Total Diterima (Bersih)</th>
              </tr>
            </thead>
            <tbody>
              ${mgRows}
              <tr class="total-row">
                <td colspan="2" style="text-align: center;">TOTAL GABUNGAN</td>
                ${classTotalCols}
                <td class="num tabular">${formatRupiah(mg.total_gross)}</td>
                <td class="num tabular">${formatRupiah(mg.total_kas_deduction)}</td>
                <td class="num tabular">${formatRupiah(mg.total_fine)}</td>
                <td class="num tabular"><strong>${formatRupiah(mg.total_net)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. Detailed Class Entries (grouped by class_code)
  // Group entries by class_code
  const entriesByClass = new Map<string, PayrollEntry[]>();
  for (const e of entries) {
    if (selectedClassCode && e.class_code !== selectedClassCode) continue;
    if (searchQuery && !e.member_name.toLowerCase().includes(searchQuery.toLowerCase())) continue;

    if (!entriesByClass.has(e.class_code)) {
      entriesByClass.set(e.class_code, []);
    }
    entriesByClass.get(e.class_code)!.push(e);
  }

  let detailSectionsHtml = '';
  for (const [code, items] of entriesByClass.entries()) {
    let subHours = 0;
    let subGross = 0;
    let subDeduction = 0;
    let subFine = 0;
    let subNet = 0;

    const rows = items.map((e, idx) => {
      subHours += e.hours;
      subGross += e.gross_pay;
      subDeduction += e.kas_deduction;
      subFine += e.fine_amount;
      subNet += e.net_pay;

      return `
        <tr data-member-row data-member-name="${escapeHtml(e.member_name.toLowerCase())}">
          <td class="tabular" style="width: 40px; text-align: center;">${idx + 1}</td>
          <td class="sticky-col"><strong>${escapeHtml(e.member_name)}</strong></td>
          <td class="num tabular">${formatHours(e.hours)}</td>
          <td class="num tabular">${formatRupiah(e.hourly_rate)}</td>
          <td class="num tabular">${formatRupiah(e.gross_pay)}</td>
          <td class="num tabular">${formatRupiah(e.kas_deduction)}</td>
          <td class="num tabular">
            ${e.fine_amount > 0 ? `${formatRupiah(e.fine_amount)} <span style="font-size:10px; color:var(--ink-muted);">(${escapeHtml(e.fine_reason || '')})</span>` : '-'}
          </td>
          <td class="num tabular"><strong>${formatRupiah(e.net_pay)}</strong></td>
          <td style="text-align: center;">
            <span class="badge ${e.posted_to_kas ? 'badge-success' : 'badge-warn'}">
              ${e.posted_to_kas ? 'Masuk Kas' : 'Belum'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    detailSectionsHtml += `
      <div style="margin-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <h4 style="font-size: 13px; font-weight: 700;">KELAS / PRODI: ${escapeHtml(code)}</h4>
          <span style="font-size: 11px; color: var(--ink-muted);">${items.length} Entri Honorarium</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">No</th>
                <th class="sticky-col">Nama Anggota</th>
                <th class="num">Jam</th>
                <th class="num">Tarif/Jam</th>
                <th class="num">Gaji Bruto</th>
                <th class="num">Potongan Kas</th>
                <th class="num">Denda (+ Alasan)</th>
                <th class="num">Gaji Bersih</th>
                <th style="text-align: center;">Status Kas</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="total-row">
                <td colspan="2" style="text-align: center;">SUBTOTAL ${escapeHtml(code)}</td>
                <td class="num tabular">${formatHours(subHours)}</td>
                <td></td>
                <td class="num tabular">${formatRupiah(subGross)}</td>
                <td class="num tabular">${formatRupiah(subDeduction)}</td>
                <td class="num tabular">${formatRupiah(subFine)}</td>
                <td class="num tabular"><strong>${formatRupiah(subNet)}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  const exportUrl = `${orgPrefix}/export/gaji.csv?period=${selectedPeriod?.id || 'all'}`;

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
      <div>
        <h2 style="font-size: 16px; font-weight: 700; text-transform: uppercase;">Rekapitulasi Honorarium &amp; Penggajian</h2>
        <span style="font-size: 12px; color: var(--ink-muted);">Periode: <strong>${escapeHtml(selectedPeriod?.name || 'Semua')}</strong></span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <a href="${exportUrl}" class="btn">[ Export CSV Gaji ]</a>
        <button onclick="window.print()" class="btn btn-primary">[ Cetak Laporan (PDF) ]</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="form-panel no-print" style="padding: 10px 14px; margin-bottom: 16px;">
      <form method="GET" action="${orgPrefix}/gaji" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
        <div style="display: flex; gap: 6px; align-items: center;">
          <label for="gaji_period" style="font-size: 12px; font-weight: 600;">Periode:</label>
          <select id="gaji_period" name="period" class="form-control" style="width: auto; padding: 4px 8px;" onchange="this.form.submit()">
            <option value="all">Semua Periode</option>
            ${periodOptions}
          </select>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <label for="gaji_class" style="font-size: 12px; font-weight: 600;">Kelas/Prodi:</label>
          <select id="gaji_class" name="class" class="form-control" style="width: auto; padding: 4px 8px;" onchange="this.form.submit()">
            <option value="">Semua Kelas</option>
            ${classOptions}
          </select>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex: 1; min-width: 200px;">
          <label for="gaji_search" class="sr-only">Cari nama anggota</label>
          <input id="gaji_search" type="text" name="q" value="${escapeHtml(searchQuery)}" placeholder="Ketik nama anggota untuk filter cepat..." class="form-control" style="padding: 4px 8px;" oninput="filterPayrollInstant(this.value)">
          <button type="submit" class="btn btn-sm">Cari</button>
          ${searchQuery || selectedClassCode ? `<a href="${orgPrefix}/gaji?period=${selectedPeriod?.id || 'all'}" class="btn btn-sm" style="text-decoration:none;">Reset</a>` : ''}
        </div>
      </form>
    </div>

    <script>
      (function() {
        var timer = null;
        window.filterPayrollInstant = function(query) {
          clearTimeout(timer);
          timer = setTimeout(function() {
            var q = (query || '').trim().toLowerCase();
            var rows = document.querySelectorAll('tr[data-member-row]');
            rows.forEach(function(row) {
              var name = row.getAttribute('data-member-name') || '';
              row.style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
            });
          }, 120);
        };
      })();
    </script>

    <!-- BAGIAN 1: Tabel Rekapitulasi per Kelas / Prodi -->
    <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Bagian 1: Rekapitulasi per Kelas / Prodi</h3>
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
          ${recapRows}
          <tr class="total-row">
            <td colspan="2" style="text-align: center;">GRAND TOTAL KESELURUHAN</td>
            <td class="num tabular">${grandMembers}</td>
            <td class="num tabular">${formatHours(grandHours)}</td>
            <td class="num tabular">${formatRupiah(grandGross)}</td>
            <td class="num tabular">${formatRupiah(grandDeduction)}</td>
            <td class="num tabular">${formatRupiah(grandFine)}</td>
            <td class="num tabular"><strong>${formatRupiah(grandNet)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- BAGIAN 2: Tabel Gabungan Kelompok Kelas (TE REG + INT) -->
    ${mergeGroupsHtml}

    <!-- BAGIAN 3: Rincian Lengkap per Kelas / Prodi -->
    <div style="margin-top: 24px;">
      <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Bagian 3: Rincian Lengkap Honorarium / Gaji per Kelas</h3>
      ${detailSectionsHtml || `<div style="border: 1px solid var(--border-strong);">${renderEmptyState('Tidak ada entri honorarium / gaji yang cocok dengan filter.')}</div>`}
    </div>
  `;
}
