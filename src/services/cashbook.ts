import type { Organization, PayrollEntry, CashTransaction, Period } from '../types';
import { logAudit } from '../lib/audit';

export async function postPayrollToCashbook(
  db: D1Database,
  org: Organization,
  period: Period,
  entries: PayrollEntry[],
  actorUserId: number,
  actorEmail: string
): Promise<{ postedCount: number; error?: string }> {
  if (period.status === 'locked') {
    return { postedCount: 0, error: 'Periode sudah dikunci (Tutup Buku). Buka kunci terlebih dahulu jika ingin merevisi.' };
  }

  const unposted = entries.filter(e => e.posted_to_kas === 0);
  if (unposted.length === 0) {
    return { postedCount: 0, error: 'Tidak ada entri gaji baru yang belum diposting ke Buku Kas.' };
  }

  const txDate = new Date().toISOString().slice(0, 10);
  const statements: D1PreparedStatement[] = [];
  const grouping = org.payroll_post_grouping || 'individual';

  if (grouping === 'batch_recap') {
    if (org.payroll_cash_mode === 'deduction_only') {
      const totalDeduction = unposted.reduce((acc, e) => acc + e.kas_deduction, 0);
      const totalFine = unposted.reduce((acc, e) => acc + e.fine_amount, 0);

      if (totalDeduction > 0) {
        statements.push(
          db.prepare(`
            INSERT INTO cash_transactions (
              org_id, period_id, tx_date, type, category, description, amount,
              proof_status, proof_url, source_type, payroll_entry_id, created_by
            ) VALUES (?, ?, ?, 'income', 'Potongan Kas Gaji', ?, ?, 'lengkap', NULL, 'payroll_deduction', NULL, ?)
          `).bind(
            org.id,
            period.id,
            txDate,
            `Rekap Potongan Kas Honorarium / Gaji ${period.name} (${unposted.length} Entri)`,
            totalDeduction,
            actorUserId
          )
        );
      }

      if (totalFine > 0) {
        statements.push(
          db.prepare(`
            INSERT INTO cash_transactions (
              org_id, period_id, tx_date, type, category, description, amount,
              proof_status, proof_url, source_type, payroll_entry_id, created_by
            ) VALUES (?, ?, ?, 'income', 'Denda Gaji', ?, ?, 'lengkap', NULL, 'payroll_fine', NULL, ?)
          `).bind(
            org.id,
            period.id,
            txDate,
            `Rekap Denda Honorarium / Gaji ${period.name}`,
            totalFine,
            actorUserId
          )
        );
      }
    } else {
      const totalNet = unposted.reduce((acc, e) => acc + e.net_pay, 0);
      if (totalNet > 0) {
        statements.push(
          db.prepare(`
            INSERT INTO cash_transactions (
              org_id, period_id, tx_date, type, category, description, amount,
              proof_status, proof_url, source_type, payroll_entry_id, created_by
            ) VALUES (?, ?, ?, 'expense', 'Pencairan Gaji', ?, ?, 'menunggu_verifikasi', NULL, 'payroll_disbursement', NULL, ?)
          `).bind(
            org.id,
            period.id,
            txDate,
            `Rekap Pencairan Honorarium / Gaji ${period.name} (${unposted.length} Entri)`,
            totalNet,
            actorUserId
          )
        );
      }
    }

    for (const entry of unposted) {
      statements.push(
        db.prepare(`
          UPDATE payroll_entries
          SET posted_to_kas = 1, posted_at = CURRENT_TIMESTAMP, updated_by = ?
          WHERE id = ?
        `).bind(actorUserId, entry.id)
      );
    }
  } else {
    for (const entry of unposted) {
      if (org.payroll_cash_mode === 'deduction_only') {
        // 1. Kas deduction income
        if (entry.kas_deduction > 0) {
          statements.push(
            db.prepare(`
              INSERT INTO cash_transactions (
                org_id, period_id, tx_date, type, category, description, amount,
                proof_status, proof_url, source_type, payroll_entry_id, created_by
              ) VALUES (?, ?, ?, 'income', 'Potongan Kas Gaji', ?, ?, 'lengkap', NULL, 'payroll_deduction', ?, ?)
            `).bind(
              org.id,
              period.id,
              txDate,
              `Potongan kas gaji ${entry.member_name} (${entry.class_code} - ${period.name})`,
              entry.kas_deduction,
              entry.id,
              actorUserId
            )
          );
        }

        // 2. Fine income
        if (entry.fine_amount > 0) {
          statements.push(
            db.prepare(`
              INSERT INTO cash_transactions (
                org_id, period_id, tx_date, type, category, description, amount,
                proof_status, proof_url, source_type, payroll_entry_id, created_by
              ) VALUES (?, ?, ?, 'income', 'Denda Gaji', ?, ?, 'lengkap', NULL, 'payroll_fine', ?, ?)
            `).bind(
              org.id,
              period.id,
              txDate,
              `Denda ${entry.member_name} (${entry.class_code} - ${period.name}): ${entry.fine_reason || 'Denda Keterlambatan'}`,
              entry.fine_amount,
              entry.id,
              actorUserId
            )
          );
        }
      } else {
        // full_disbursement mode
        if (entry.net_pay > 0) {
          statements.push(
            db.prepare(`
              INSERT INTO cash_transactions (
                org_id, period_id, tx_date, type, category, description, amount,
                proof_status, proof_url, source_type, payroll_entry_id, created_by
              ) VALUES (?, ?, ?, 'expense', 'Pencairan Gaji', ?, ?, 'menunggu_verifikasi', NULL, 'payroll_disbursement', ?, ?)
            `).bind(
              org.id,
              period.id,
              txDate,
              `Pencairan Gaji ${entry.member_name} (${entry.class_code} - ${period.name})`,
              entry.net_pay,
              entry.id,
              actorUserId
            )
          );
        }
      }

      // Mark entry as posted
      statements.push(
        db.prepare(`
          UPDATE payroll_entries
          SET posted_to_kas = 1, posted_at = CURRENT_TIMESTAMP, updated_by = ?
          WHERE id = ?
        `).bind(actorUserId, entry.id)
      );
    }
  }

  // Execute in batch
  await db.batch(statements);

  await logAudit(
    db,
    org.id,
    actorUserId,
    actorEmail,
    'POST_PAYROLL',
    'period',
    period.id,
    `Posting ${unposted.length} entri gaji ${period.name} ke Buku Kas Organisasi`
  );

  return { postedCount: unposted.length };
}

export async function cancelPayrollPosting(
  db: D1Database,
  orgId: number,
  periodId: number,
  payrollEntryId: number,
  actorUserId: number,
  actorEmail: string
): Promise<{ success: boolean; error?: string }> {
  const entry = await db.prepare('SELECT * FROM payroll_entries WHERE id = ? AND org_id = ?')
    .bind(payrollEntryId, orgId)
    .first<PayrollEntry>();

  if (!entry) return { success: false, error: 'Entri gaji tidak ditemukan.' };
  if (entry.posted_to_kas === 0) return { success: false, error: 'Entri gaji ini belum diposting ke Buku Kas.' };

  const period = await db.prepare('SELECT * FROM periods WHERE id = ?').bind(periodId).first<Period>();
  if (period?.status === 'locked') {
    return { success: false, error: 'Periode sudah dikunci. Buka kunci terlebih dahulu.' };
  }

  // Delete linked cash transactions and reset posted_to_kas
  const linkedTx = await db.prepare('SELECT id FROM cash_transactions WHERE payroll_entry_id = ? AND org_id = ?')
    .bind(payrollEntryId, orgId)
    .all<{ id: number }>();

  const batchStmts: D1PreparedStatement[] = [];

  if (linkedTx.results.length > 0) {
    batchStmts.push(
      db.prepare('DELETE FROM cash_transactions WHERE payroll_entry_id = ? AND org_id = ?').bind(payrollEntryId, orgId)
    );
  } else {
    // Handle lumped/seeded recap transactions where payroll_entry_id IS NULL (REV-013)
    const adjustRecap = async (sourceType: string, amountToDeduct: number) => {
      if (amountToDeduct <= 0) return;
      const recap = await db.prepare(`
        SELECT id, amount FROM cash_transactions
        WHERE org_id = ? AND period_id = ? AND payroll_entry_id IS NULL AND source_type = ?
        ORDER BY id DESC LIMIT 1
      `).bind(orgId, periodId, sourceType).first<{ id: number; amount: number }>();

      if (recap) {
        const remaining = recap.amount - amountToDeduct;
        if (remaining > 0) {
          batchStmts.push(
            db.prepare('UPDATE cash_transactions SET amount = ? WHERE id = ?').bind(remaining, recap.id)
          );
        } else {
          batchStmts.push(
            db.prepare('DELETE FROM cash_transactions WHERE id = ?').bind(recap.id)
          );
        }
      }
    };

    if (entry.kas_deduction > 0) await adjustRecap('payroll_deduction', entry.kas_deduction);
    if (entry.fine_amount > 0) await adjustRecap('payroll_fine', entry.fine_amount);
    if (entry.net_pay > 0) await adjustRecap('payroll_disbursement', entry.net_pay);
  }

  batchStmts.push(
    db.prepare('UPDATE payroll_entries SET posted_to_kas = 0, posted_at = NULL, updated_by = ? WHERE id = ?').bind(actorUserId, payrollEntryId)
  );

  await db.batch(batchStmts);

  await logAudit(
    db,
    orgId,
    actorUserId,
    actorEmail,
    'CANCEL_PAYROLL_POST',
    'payroll_entry',
    payrollEntryId,
    `Membatalkan posting kas entri gaji: ${entry.member_name} (${entry.class_code})`
  );

  return { success: true };
}

export function computeRunningBalances(transactions: CashTransaction[]): CashTransaction[] {
  // Sort oldest to newest to compute running balance, then return in original order
  // Or if sorted descending (newest first), reverse, compute, reverse back.
  const copy = [...transactions].sort((a, b) => {
    if (a.tx_date !== b.tx_date) {
      return a.tx_date.localeCompare(b.tx_date);
    }
    return a.id - b.id;
  });

  let balance = 0;
  for (const tx of copy) {
    if (tx.type === 'income') {
      balance += tx.amount;
    } else {
      balance -= tx.amount;
    }
    tx.running_balance = balance;
  }

  // Map back to original order
  const balanceMap = new Map<number, number>();
  for (const tx of copy) {
    balanceMap.set(tx.id, tx.running_balance!);
  }

  return transactions.map(t => ({
    ...t,
    running_balance: balanceMap.get(t.id) ?? 0
  }));
}
