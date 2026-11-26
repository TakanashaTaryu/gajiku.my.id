-- Fictional demonstration data only. Do not add real member or payroll records.
INSERT OR IGNORE INTO users (id, email, name, is_super_admin, is_active) VALUES
  (1, 'admin@example.com', 'Demo Administrator', 1, 1),
  (2, 'treasurer@example.com', 'Demo Treasurer', 0, 1),
  (3, 'auditor@example.com', 'Demo Auditor', 0, 1);

INSERT OR IGNORE INTO organizations
  (id, slug, subdomain, name, short_code, description, is_public, deduction_mode, deduction_value, payroll_cash_mode, created_by)
VALUES
  (1, 'demo-organization', 'demo-organization', 'Demo Organization', 'DEMO', 'Fictional organization for local development.', 1, 'auto_percent', 5, 'deduction_only', 1);

INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, assigned_by) VALUES
  (1, 1, 'org_admin', 1),
  (1, 2, 'treasurer', 1),
  (1, 3, 'auditor', 1);

INSERT OR IGNORE INTO org_classes (id, org_id, code, name, hourly_rate, sort_order) VALUES
  (1, 1, 'DEMO', 'Demo Class', 10000, 1);

INSERT OR IGNORE INTO periods (id, org_id, name, start_date, end_date, status) VALUES
  (1, 1, 'Demo Period', '2026-01-01', '2026-01-31', 'open');

INSERT INTO payroll_entries
  (org_id, period_id, class_id, class_code, member_name, hours, hourly_rate, gross_pay, kas_deduction_mode, kas_deduction, fine_amount, net_pay)
VALUES
  (1, 1, 1, 'DEMO', 'Demo Member', 2, 10000, 20000, 'auto', 1000, 0, 19000);
