// src/pages/legal/legalConfig.ts
//
// Single source of truth for everything the Terms and the Privacy Policy say about
// WHO we are and the few numbers that are policy choices (not facts of the code).
// Change a value here and both documents, the footer links and the page headers follow.
//
// Facts in the two documents were taken from what Plot Yangu (this repo), PAY
// (payments / SMS top-ups / trial grant) and CYBER (Samuhia Desk) actually do today.
// If one of those behaviours changes, update the matching clause and bump LEGAL_VERSION.

export const COMPANY = {
  /** Registered name. */
  legalName: 'SAMUHIA BUSINESSES KENYA',
  /** Short form used inside the documents ("we", "us"). */
  shortName: 'Samuhia',
  product: 'Plot Yangu',
  country: 'Kenya',
  /** Principal place of business. Add a street / P.O. Box here if you want it printed. */
  location: 'Nakuru, Kenya',
  /** Optional: printed only when non-empty. */
  registrationNumber: '',
  /** Optional: Office of the Data Protection Commissioner registration number. Printed only when non-empty. */
  odpcRegistrationNumber: '',
  email: 'info@samuhia.co.ke',
  salesEmail: 'sales@samuhia.co.ke',
  whatsapp: '+254 791 286 165',
  whatsappHref: 'https://wa.me/254791286165',
  website: 'https://samuhia.co.ke/',
  appUrl: 'https://plot.samuhia.co.ke',
  odpcUrl: 'https://www.odpc.go.ke',
} as const;

/** Bump whenever either document changes in substance. */
export const LEGAL_VERSION = '1.0';
/** Human-readable dates shown at the top of both documents. */
export const LEGAL_EFFECTIVE = '14 October 2026';
export const LEGAL_UPDATED = '14 October 2026';

/** Policy choices (not facts of the code). Edit freely; the documents read from here. */
export const POLICY = {
  /** Days a person has to report a duplicate or unapplied payment. */
  paymentDisputeDays: 30,
  /** Days we take to delete or anonymise cloud data after a closure request is verified. */
  deletionDays: 90,
  /** Minimum notice before a material change to the Terms takes effect. */
  changeNoticeDays: 30,
  /** Years payment and subscription records are kept (Kenyan tax and accounting record-keeping). */
  financialRecordYears: 7,
  /** Days we aim to answer a privacy request. */
  privacyReplyDays: 30,
  /** Minimum age of an account holder. */
  minimumAge: 18,
  /** Liability cap fallback (KES) for accounts that have paid nothing in the previous 12 months. */
  liabilityFloorKes: 5000,
} as const;

export const LEGAL_PATHS = {
  terms: '/terms',
  privacy: '/privacy',
} as const;

export type LegalDocKey = keyof typeof LEGAL_PATHS;

/** Which legal page (if any) a URL path points at. Tolerates a trailing slash and any letter case. */
export function legalKeyForPath(pathname: string): LegalDocKey | null {
  const p = pathname.replace(/\/+$/, '').toLowerCase();
  if (p === LEGAL_PATHS.terms) return 'terms';
  if (p === LEGAL_PATHS.privacy) return 'privacy';
  return null;
}
