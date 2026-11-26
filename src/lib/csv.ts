import { formatRupiah, formatHours } from './format';
import type { PayrollEntry, CashTransaction } from '../types';

export interface ParsedPayrollRow {
  class_code: string;
  member_name: string;
  hours: number;
}

export function parsePayrollCSV(content: string): { rows: ParsedPayrollRow[]; errors: string[] } {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: ParsedPayrollRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check delimiter: tab, semicolon, or comma
    let parts: string[];
    if (line.includes('\t')) {
      parts = line.split('\t');
    } else if (line.includes(';')) {
      parts = line.split(';');
    } else {
      parts = line.split(',');
    }

    parts = parts.map(p => p.trim());
    if (parts.length < 3) {
      errors.push(`Baris ${i + 1}: Format tidak lengkap. Harus 'KODE_KELAS, NAMA, JAM' (Contoh: TE, John Doe, 12.5).`);
      continue;
    }

    const class_code = parts[0].toUpperCase();
    const member_name = parts[1];
    const rawHours = parts[2].replace(',', '.');
    const hours = parseFloat(rawHours);

    if (!class_code) {
      errors.push(`Baris ${i + 1}: Kode kelas tidak boleh kosong.`);
      continue;
    }
    if (!member_name) {
      errors.push(`Baris ${i + 1}: Nama anggota tidak boleh kosong.`);
      continue;
    }
    if (isNaN(hours) || hours < 0) {
      errors.push(`Baris ${i + 1}: Jam kerja '${parts[2]}' tidak valid. Harus angka >= 0.`);
      continue;
    }

    rows.push({ class_code, member_name, hours });
  }

  return { rows, errors };
}

const escapeCSV = (val: unknown): string => {
  if (val === null || val === undefined) return '""';
  let s = String(val);
  // Prevent CSV Formula Injection (CWE-1236)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
};

export function generatePayrollCSV(entries: PayrollEntry[], periodName: string): string {
  const headers = [
    'No',
    'Kelas',
    'Periode',
    'Nama Anggota',
    'Jam Kerja',
    'Tarif per Jam',
    'Gaji Bruto',
    'Potongan Kas',
    'Denda',
    'Alasan Denda',
    'Gaji Bersih',
    'Status Kas'
  ];

  const rows = entries.map((e, idx) => [
    idx + 1,
    escapeCSV(e.class_code),
    escapeCSV(periodName),
    escapeCSV(e.member_name),
    escapeCSV(formatHours(e.hours)),
    escapeCSV(e.hourly_rate),
    escapeCSV(e.gross_pay),
    escapeCSV(e.kas_deduction),
    escapeCSV(e.fine_amount),
    escapeCSV(e.fine_reason || ''),
    escapeCSV(e.net_pay),
    escapeCSV(e.posted_to_kas ? 'Sudah Diposting' : 'Belum Diposting')
  ].join(','));

  return [headers.join(','), ...rows].join('\r\n');
}

export function generateCashCSV(transactions: CashTransaction[]): string {
  const headers = [
    'No',
    'Tanggal',
    'Keterangan',
    'Kategori',
    'Jenis',
    'Masuk (Rp)',
    'Keluar (Rp)',
    'Status Bukti',
    'Tautan Bukti'
  ];

  const rows = transactions.map((t, idx) => [
    idx + 1,
    escapeCSV(t.tx_date),
    escapeCSV(t.description),
    escapeCSV(t.category),
    escapeCSV(t.type === 'income' ? 'Pemasukan' : 'Pengeluaran'),
    escapeCSV(t.type === 'income' ? t.amount : 0),
    escapeCSV(t.type === 'expense' ? t.amount : 0),
    escapeCSV(t.proof_status),
    escapeCSV(t.proof_url || '')
  ].join(','));

  return [headers.join(','), ...rows].join('\r\n');
}
