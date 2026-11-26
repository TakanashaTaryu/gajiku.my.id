import type { Organization, OrgClass, PayrollEntry } from '../types';

export interface CombinedMergeGroupRow {
  member_name: string;
  class_entries: Record<string, { hours: number; gross: number }>;
  total_hours: number;
  total_gross: number;
  total_kas_deduction: number;
  total_fine: number;
  total_net: number;
}

export interface CombinedMergeGroupSummary {
  merge_group: string;
  class_codes: string[];
  rows: CombinedMergeGroupRow[];
  total_hours: number;
  total_gross: number;
  total_kas_deduction: number;
  total_fine: number;
  total_net: number;
}

export function calculateGrossPay(hours: number, hourlyRate: number): number {
  return Math.round(hours * hourlyRate);
}

export function calculateKasDeduction(
  grossPay: number,
  mode: Organization['deduction_mode'],
  deductionValue: number
): number {
  if (mode === 'auto_percent') {
    return Math.round(grossPay * (deductionValue / 100));
  } else if (mode === 'auto_fixed') {
    return Math.min(grossPay, Math.round(deductionValue));
  }
  return 0; // manual
}

export function calculateNetPay(grossPay: number, kasDeduction: number, fineAmount: number): number {
  const net = grossPay - kasDeduction - fineAmount;
  return Math.max(0, net);
}

export function buildMergeGroupSummary(
  entries: PayrollEntry[],
  groupCode: string
): CombinedMergeGroupSummary {
  const groupEntries = entries.filter(e => e.merge_group === groupCode);
  const classCodeSet = new Set<string>();
  for (const e of groupEntries) {
    classCodeSet.add(e.class_code);
  }
  const class_codes = Array.from(classCodeSet).sort();

  // Group by member_name case-insensitively
  const memberMap = new Map<string, {
    canonicalName: string;
    class_entries: Record<string, { hours: number; gross: number }>;
    total_hours: number;
    total_gross: number;
    total_kas_deduction: number;
    total_fine: number;
    total_net: number;
  }>();

  for (const e of groupEntries) {
    const key = e.member_name.trim().toLowerCase();
    let current = memberMap.get(key);
    if (!current) {
      current = {
        canonicalName: e.member_name.trim(),
        class_entries: {},
        total_hours: 0,
        total_gross: 0,
        total_kas_deduction: 0,
        total_fine: 0,
        total_net: 0
      };
      memberMap.set(key, current);
    }

    current.class_entries[e.class_code] = {
      hours: (current.class_entries[e.class_code]?.hours || 0) + e.hours,
      gross: (current.class_entries[e.class_code]?.gross || 0) + e.gross_pay
    };

    current.total_hours += e.hours;
    current.total_gross += e.gross_pay;
    current.total_kas_deduction += e.kas_deduction;
    current.total_fine += e.fine_amount;
    current.total_net += e.net_pay;
  }

  const rows: CombinedMergeGroupRow[] = Array.from(memberMap.values())
    .map(m => ({
      member_name: m.canonicalName,
      class_entries: m.class_entries,
      total_hours: m.total_hours,
      total_gross: m.total_gross,
      total_kas_deduction: m.total_kas_deduction,
      total_fine: m.total_fine,
      total_net: m.total_net
    }))
    .sort((a, b) => a.member_name.localeCompare(b.member_name));

  let total_hours = 0;
  let total_gross = 0;
  let total_kas_deduction = 0;
  let total_fine = 0;
  let total_net = 0;

  for (const r of rows) {
    total_hours += r.total_hours;
    total_gross += r.total_gross;
    total_kas_deduction += r.total_kas_deduction;
    total_fine += r.total_fine;
    total_net += r.total_net;
  }

  return {
    merge_group: groupCode,
    class_codes,
    rows,
    total_hours,
    total_gross,
    total_kas_deduction,
    total_fine,
    total_net
  };
}
