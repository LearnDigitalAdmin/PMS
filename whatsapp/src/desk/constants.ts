/** Samuhia Desk integration for Plot Yangu (PMS). Single place for every constant the desk modules share. */

export const DESK_REGION = "us-central1";

/** The company's top desk: always authorised on every landlord, cannot be added or removed. */
export const DESK_TOP_CODE = "COG-0000";
/** Desk codes: COG-0001, COG-0002 … (at least 4 digits). */
export const DESK_CODE_RE = /^COG-\d{4,}$/;

export const LANDLORD_CODE_PREFIX = "PYL-";
export const LANDLORD_CODE_RE = /^PYL-\d{4,}$/;

export const MAX_SUPPORT_AGENTS = 5;
export const DESK_REQUESTS_PER_DAY = 5;

/** SMS tokens granted to a new Plot Yangu account at signup. The grant itself is made by PAY's createUserWithFirebaseAuth. */
export const PMS_SIGNUP_FREE_TOKENS = 50;

/** Desk-owned collections this codebase touches (same Firestore database; names fixed by the desk contract). */
export const DESK = {
  counters: "desk_counters",
  agents: "desk_agents",
  customers: "desk_customers",
  requests: "desk_requests",
  audit: "desk_audit",
  config: "desk_config",
  splitCodes: "desk_split_codes",
} as const;

export const REQUEST_CATEGORIES = ["setup", "import", "sms", "payments", "reports", "account", "other"] as const;
export type RequestCategory = typeof REQUEST_CATEGORIES[number];

/** Africa/Nairobi has no daylight saving: a fixed UTC+3 offset. */
export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Plan limits. These MUST equal USER_LIMITS in src/services/database/FirebaseSync.tsx (the app's own table);
 * the server cannot import the app bundle. A test pins the values so a change in one is noticed.
 */
export const PMS_USER_LIMITS = {
  free: { properties: 1, tenantsPerProperty: 5, totalTenants: 5 },
  low: { properties: 3, tenantsPerProperty: 10, totalTenants: 30 },
  business: { properties: 9, tenantsPerProperty: 14, totalTenants: 126 },
  solo: { properties: 1, tenantsPerProperty: 20, totalTenants: 20 },
  pro: { properties: 16, tenantsPerProperty: 20, totalTenants: 300 },
  enterprise: { properties: -1, tenantsPerProperty: -1, totalTenants: -1 },
} as const;
export type PmsTier = keyof typeof PMS_USER_LIMITS;
