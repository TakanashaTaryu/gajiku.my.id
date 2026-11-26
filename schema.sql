PRAGMA foreign_keys = ON;

-- 1. AKUN PENGGUNA (Google OAuth & Pre-Invite Email)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  google_sub TEXT UNIQUE,
  avatar_url TEXT,
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. ORGANISASI / TENANT
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  subdomain TEXT UNIQUE,
  name TEXT NOT NULL,
  short_code TEXT,
  description TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  is_archived INTEGER NOT NULL DEFAULT 0,
  allow_admin_subdomain_edit INTEGER NOT NULL DEFAULT 1,
  deduction_mode TEXT NOT NULL DEFAULT 'auto_percent'
    CHECK (deduction_mode IN ('auto_percent', 'auto_fixed', 'manual')),
  deduction_value REAL NOT NULL DEFAULT 5,
  payroll_cash_mode TEXT NOT NULL DEFAULT 'deduction_only'
    CHECK (payroll_cash_mode IN ('deduction_only', 'full_disbursement')),
  payroll_post_grouping TEXT NOT NULL DEFAULT 'individual'
    CHECK (payroll_post_grouping IN ('individual', 'batch_recap')),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. KEANGGOTAAN & HAK AKSES PER ORGANISASI
CREATE TABLE IF NOT EXISTS org_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'treasurer', 'auditor', 'member')),
  assigned_by INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, user_id)
);

-- 4. KELAS / PRODI DINAMIS PER ORGANISASI
CREATE TABLE IF NOT EXISTS org_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  merge_group TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, code)
);

-- 5. PERIODE PENGGAJIAN / BUKU KAS
CREATE TABLE IF NOT EXISTS periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'locked')),
  locked_at DATETIME,
  locked_by INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, name)
);

-- 6. ENTRI GAJI / HONORARIUM PER PERIODE & KELAS
CREATE TABLE IF NOT EXISTS payroll_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES org_classes(id) ON DELETE SET NULL,
  class_code TEXT NOT NULL,
  merge_group TEXT,
  member_name TEXT NOT NULL,
  hours REAL NOT NULL CHECK (hours >= 0),
  hourly_rate INTEGER NOT NULL CHECK (hourly_rate >= 0),
  gross_pay INTEGER NOT NULL CHECK (gross_pay >= 0),
  kas_deduction_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (kas_deduction_mode IN ('auto', 'manual')),
  kas_deduction INTEGER NOT NULL DEFAULT 0 CHECK (kas_deduction >= 0),
  fine_amount INTEGER NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
  fine_reason TEXT,
  net_pay INTEGER NOT NULL CHECK (net_pay >= 0),
  posted_to_kas INTEGER NOT NULL DEFAULT 0,
  posted_at DATETIME,
  updated_by INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. BUKU KAS TERBUKA & STATUS KELENGKAPAN BUKTI
CREATE TABLE IF NOT EXISTS cash_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_id INTEGER REFERENCES periods(id) ON DELETE SET NULL,
  tx_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  proof_status TEXT NOT NULL DEFAULT 'belum_ada'
    CHECK (proof_status IN ('lengkap', 'belum_ada', 'menunggu_verifikasi')),
  proof_url TEXT,
  proof_verified_by INTEGER REFERENCES users(id),
  proof_verified_at DATETIME,
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'payroll_deduction', 'payroll_fine', 'payroll_disbursement')),
  payroll_entry_id INTEGER REFERENCES payroll_entries(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. KRITIK & SARAN ANGGOTA
CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL DEFAULT 'Anonim',
  nim TEXT,
  topic TEXT NOT NULL CHECK (topic IN ('Transparansi Dana', 'Perhitungan Gaji', 'Bukti Pengeluaran', 'Umum')),
  message TEXT NOT NULL,
  treasurer_reply TEXT,
  replied_by INTEGER REFERENCES users(id),
  replied_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. AUDIT LOG TRANSPARANSI
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  summary TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- INDEX PERFORMA
CREATE INDEX IF NOT EXISTS idx_organizations_subdomain ON organizations(subdomain);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_classes_org ON org_classes(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_payroll_org_period ON payroll_entries(org_id, period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_name ON payroll_entries(org_id, period_id, member_name);
CREATE INDEX IF NOT EXISTS idx_tx_org_date ON cash_transactions(org_id, tx_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tx_payroll ON cash_transactions(payroll_entry_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(org_id, created_at DESC);

-- 10. RIWAYAT ALIAS SUBDOMAIN (Untuk redirect 301 saat subdomain diubah)
CREATE TABLE IF NOT EXISTS subdomain_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_subdomain TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
