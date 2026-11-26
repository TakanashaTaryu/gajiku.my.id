export interface Env {
  DB: D1Database;
  BASE_DOMAIN: string;
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  SUPER_ADMIN_EMAILS: string;
  DEV_BYPASS_AUTH?: string;
}

export type OrgRole = 'org_admin' | 'treasurer' | 'auditor' | 'member';
export type DeductionMode = 'auto_percent' | 'auto_fixed' | 'manual';
export type PayrollCashMode = 'deduction_only' | 'full_disbursement';
export type PayrollPostGrouping = 'individual' | 'batch_recap';
export type PeriodStatus = 'draft' | 'open' | 'locked';
export type ProofStatus = 'lengkap' | 'belum_ada' | 'menunggu_verifikasi';
export type TxType = 'income' | 'expense';

export interface User {
  id: number;
  email: string;
  name: string | null;
  google_sub: string | null;
  avatar_url: string | null;
  is_super_admin: number;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
}

export interface Organization {
  id: number;
  slug: string;
  subdomain: string;
  name: string;
  short_code: string | null;
  description: string | null;
  is_public: number;
  is_archived: number;
  allow_admin_subdomain_edit: number;
  deduction_mode: DeductionMode;
  deduction_value: number;
  payroll_cash_mode: PayrollCashMode;
  payroll_post_grouping?: PayrollPostGrouping;
  created_by: number | null;
  created_at: string;
}

export interface OrgMembership {
  id: number;
  org_id: number;
  user_id: number;
  role: OrgRole;
  assigned_by: number | null;
  created_at: string;
  // joined fields
  user_email?: string;
  user_name?: string;
  org_name?: string;
  org_slug?: string;
}

export interface OrgClass {
  id: number;
  org_id: number;
  code: string;
  name: string;
  hourly_rate: number;
  merge_group: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
}

export interface Period {
  id: number;
  org_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: PeriodStatus;
  locked_at: string | null;
  locked_by: number | null;
  created_at: string;
}

export interface PayrollEntry {
  id: number;
  org_id: number;
  period_id: number;
  class_id: number | null;
  class_code: string;
  merge_group: string | null;
  member_name: string;
  hours: number;
  hourly_rate: number;
  gross_pay: number;
  kas_deduction_mode: 'auto' | 'manual';
  kas_deduction: number;
  fine_amount: number;
  fine_reason: string | null;
  net_pay: number;
  posted_to_kas: number;
  posted_at: string | null;
  updated_by: number | null;
  created_at: string;
}

export interface CashTransaction {
  id: number;
  org_id: number;
  period_id: number | null;
  tx_date: string;
  type: TxType;
  category: string;
  description: string;
  amount: number;
  proof_status: ProofStatus;
  proof_url: string | null;
  proof_verified_by: number | null;
  proof_verified_at: string | null;
  source_type: 'manual' | 'payroll_deduction' | 'payroll_fine' | 'payroll_disbursement';
  payroll_entry_id: number | null;
  created_by: number | null;
  created_at: string;
  // runtime calculation
  running_balance?: number;
}

export interface Feedback {
  id: number;
  org_id: number;
  user_id: number | null;
  sender_name: string;
  nim: string | null;
  topic: 'Transparansi Dana' | 'Perhitungan Gaji' | 'Bukti Pengeluaran' | 'Umum';
  message: string;
  treasurer_reply: string | null;
  replied_by: number | null;
  replied_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  org_id: number | null;
  actor_user_id: number | null;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  summary: string;
  created_at: string;
}

export interface SessionData {
  uid: number;
  email: string;
  name?: string;
  is_super_admin: boolean;
  exp: number;
}
