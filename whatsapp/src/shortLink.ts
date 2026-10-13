// Short invoice links for SMS.
//
// A Firebase Storage download URL is ~200 characters, which would turn a
// 2-credit SMS into a 4-credit one. Instead we send https://plot.samuhia.co.ke/i/<code>
// (about 35 characters). The `invoiceLink` function resolves <code> and redirects.
//
// Pure helpers only (no Firebase imports) so they are unit-testable.
import crypto from "crypto";

/** Characters billed as one SMS credit - must match sendSmsWithWhatsAppFallback. */
export const SMS_TOKEN_CHARS = 144;

/**
 * How many extra credits a link may cost on top of the same message without it.
 * 1 = "at most one more credit"; the helper first tries a shorter wording so most
 * messages get the link for free. Set to 0 to only ever add the link when it fits.
 */
export const SMS_LINK_MAX_EXTRA_TOKENS = 1;

export const DEFAULT_SHORT_LINK_BASE = "https://plot.samuhia.co.ke/i";
export const SHORT_CODE_LENGTH = 7;

// Lower-case, no look-alikes (0/o, 1/l/i) - 31^7 = ~2.7e10 codes.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function smsTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / SMS_TOKEN_CHARS));
}

export function newShortCode(length: number = SHORT_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

export function buildShortUrl(code: string, base: string = process.env.SHORT_LINK_BASE || DEFAULT_SHORT_LINK_BASE): string {
  return `${base.replace(/\/+$/, "")}/${code}`;
}

/** Accepts "/i/abc2345" or "/abc2345" (with or without a trailing slash). */
export function parseShortCode(path: string): string | null {
  const m = /^\/(?:i\/)?([a-z0-9]{5,12})\/?$/.exec(path || "");
  return m ? m[1] : null;
}

/** Only ever redirect to our own Firebase Storage downloads (never an open redirect). */
export function isAllowedRedirectTarget(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "firebasestorage.googleapis.com" ||
      u.hostname === "storage.googleapis.com" ||
      u.hostname.endsWith(".firebasestorage.app")
    );
  } catch {
    return false;
  }
}

/**
 * Returns `base` (the message without a link) unless a link fits the credit budget.
 * Tries the normal wording first, then the compact wording, and keeps whichever is
 * cheapest (ties prefer the normal wording).
 */
export function attachShortLink(opts: {
  base: string;
  fullBody: string;
  compactBody: string;
  sign: string;
  label: string;
  link: string;
  maxExtraTokens?: number;
  sanitize: (s: string) => string;
}): string {
  const { base, fullBody, compactBody, sign, label, link, sanitize } = opts;
  const maxExtra = opts.maxExtraTokens ?? SMS_LINK_MAX_EXTRA_TOKENS;
  const budget = smsTokens(base) + maxExtra;
  let best: string | null = null;
  for (const body of [fullBody, compactBody]) {
    const cand = sanitize(`${body} ${label} ${link}${sign}`);
    if (!cand.includes(link)) continue; // would have been truncated
    const t = smsTokens(cand);
    if (t > budget) continue;
    if (best === null || t < smsTokens(best)) best = cand;
  }
  return best ?? base;
}
