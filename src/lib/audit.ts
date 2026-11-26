export async function logAudit(
  db: D1Database,
  orgId: number | null,
  actorUserId: number | null,
  actorEmail: string,
  action: string,
  targetType: string,
  targetId: string | number | null,
  summary: string
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO audit_logs (org_id, actor_user_id, actor_email, action, target_type, target_id, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orgId,
      actorUserId,
      actorEmail,
      action,
      targetType,
      targetId !== null ? String(targetId) : null,
      summary
    ).run();
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
