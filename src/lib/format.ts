export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatRupiah(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(Number(num))) return 'Rp0';
  const val = Math.round(Number(num));
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = absVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (isNegative ? '-Rp' : 'Rp') + formatted;
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '0';
  const h = Number(hours);
  return Number.isInteger(h) ? h.toString() : h.toFixed(1).replace('.', ',');
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return String(dateStr);
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const dateFormatted = formatDate(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${dateFormatted} ${hours}:${mins}`;
  } catch {
    return String(dateStr);
  }
}

export function renderEmptyState(message: string, ctaHtml = ''): string {
  return `
    <div class="empty-state">
      <div class="empty-state-icon mono">[ &mdash; ]</div>
      <div class="empty-state-text">${escapeHtml(message)}</div>
      ${ctaHtml ? `<div class="empty-state-cta">${ctaHtml}</div>` : ''}
    </div>
  `;
}
