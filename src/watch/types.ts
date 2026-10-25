// Landlord Watch: contract types (LANDLORD_WATCH_CONTRACT.md v1.1, section 7).
export type MaskLevel = 'full' | 'tenant' | 'open';
export type Lang = 'en' | 'sw';

/** Every number is an object so a masked value can still be displayed. Always render `d`. */
export interface N { v: number | null; d: string }

export interface Connection {
  ownerId: string; propertyName: string; address: string | null;
  connectedAt: string;
  unlocked: boolean; unlockedUntil: string | null; // null with unlocked=true means auto-unlock
}

export interface Statement {
  source: 'agent' | 'estimate';
  status: 'draft' | 'finalized' | 'sent' | 'acknowledged' | null;
  notes: string | null;
  items: { label: string; kind: 'income' | 'deduction'; amount: N }[];
  income: N; deductions: N; netPayable: N;
}

export interface TenantRow {
  ref: string;
  name: string;
  phone: string;
  unit: string | null;
  status: 'paid' | 'partial' | 'unpaid' | 'no_invoice' | 'masked';
  rent: N; billed: N; paid: N; balance: N;
  dueDate: string | null; paidOn: string | null; paidOnTime: boolean | null;
}

export interface Snapshot {
  schema: 1;
  ownerId: string;
  month: string;
  generatedAt: string;
  mask: {
    level: MaskLevel;
    reason: 'locked' | 'otp' | 'auth_phone_match' | 'channel_policy';
    unlockedUntil: string | null;
    canUnlock: boolean;
  };
  property: { name: string; address: string | null; maxUnits: N; commissionRatePct: N; managedByAgency: boolean };
  months: string[];
  summary: {
    tenants: { active: N; occupiedUnits: N; vacantUnits: N; occupancyPct: N };
    invoices: { total: N; paid: N; partial: N; unpaid: N; noInvoice: N };
    billed: N; collected: N; pending: N; collectionRatePct: N;
    baseRent: { billed: N; collected: N };
    commission: { ratePct: N; onCollected: N; onExpected: N };
    net: { expected: N; payable: N; stillToCollect: N };
    statement: Statement;
    remittance: { dueDate: string; collectedByDue: N; collectedAfterDue: N; netByDue: N; netAfterDue: N };
  };
  tenants: TenantRow[];
  trend: { month: string; billed: N; collected: N; pending: N; netPayable: N }[];
}

export interface Quota {
  period: string;
  freeLimit: number;
  freeUsed: number;
  nextPriceKes: number;
}

export type TranscriptState =
  | 'otp_pending' | 'payment_required' | 'payment_pending' | 'paid'
  | 'generating' | 'ready' | 'failed' | 'expired';

export interface TranscriptRequest {
  requestId: string; ownerId: string; month: string;
  state: TranscriptState;
  priceKes: number;
  sentTo?: string;
  expiresInSec?: number; resendInSec?: number;
  url?: string;
  expiresAt?: string;
  reference?: string;
  message?: string;
  error?: { code: string; message: string };
  createdAt: string;
}

export interface LookupResult {
  found: boolean;
  property?: { ownerId: string; name: string; address: string | null; ownerPhoneMasked: string; managedByAgency: boolean };
}
export interface OtpSent { sentTo?: string; expiresInSec: number; resendInSec: number }
export interface UnlockResult { unlocked: true; unlockedUntil: string; level: MaskLevel }
export type SnapshotResponse =
  | { notModified: true; etag: string }
  | { notModified?: false; snapshot: Snapshot; etag: string };

export type LwCode =
  | 'LW_BAD_OWNER_ID' | 'LW_NOT_FOUND' | 'LW_RATE_LIMITED' | 'LW_NO_PHONE_ON_FILE'
  | 'LW_OTP_COOLDOWN' | 'LW_OTP_WRONG' | 'LW_OTP_EXPIRED' | 'LW_OTP_LOCKED' | 'LW_SMS_FAILED'
  | 'LW_LOCKED' | 'LW_CONNECTION_LIMIT' | 'LW_BAD_MONTH' | 'LW_PAYMENT_FAILED'
  | 'LW_NOT_ALLOWED' | 'LW_UNAVAILABLE'
  | 'LW_NETWORK'; // client-only: no connection

/** Error thrown by every api.ts method. Clients branch on `lw`, never on message text. */
export class LwError extends Error {
  lw: LwCode;
  retryAfterSec?: number;
  attemptsLeft?: number;
  constructor(lw: LwCode, extra?: { retryAfterSec?: number; attemptsLeft?: number }) {
    super(lw);
    this.name = 'LwError';
    this.lw = lw;
    this.retryAfterSec = extra?.retryAfterSec;
    this.attemptsLeft = extra?.attemptsLeft;
  }
}

export type SignInErrorKind =
  | 'invalid_number' | 'cooldown' | 'sms_failed' | 'wrong_code' | 'expired' | 'no_code' | 'network' | 'unknown';

/** Error from the phone sign-in callables (sendLoginOtp / verifyLoginOtp). */
export class SignInError extends Error {
  kind: SignInErrorKind;
  retryAfterSec?: number;
  constructor(kind: SignInErrorKind, retryAfterSec?: number) {
    super(kind);
    this.name = 'SignInError';
    this.kind = kind;
    this.retryAfterSec = retryAfterSec;
  }
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; phone: string };
