/**
 * Kenyan phone handling — ONE place. Pure, no imports. Identical copy lives in PMS/whatsapp/src/phone/safaricom.ts.
 *
 * Accepts a string OR a number (an app that stores the phone as a number turns 0701234567 into 701234567, which used to
 * fail every formatter that expected a string). Understands 0701234567, 701234567, 254701234567, +254701234567,
 * "+254 701-234-567" and the same with a stray "(0)".
 */

/** Every current Safaricom prefix, as the 4-digit national prefix (0xxx). Inclusive ranges. */
export const SAFARICOM_PREFIX_RANGES: ReadonlyArray<readonly [number, number]> = [
  [700, 729], [740, 743], [745, 746], [757, 759], [768, 769], [790, 799],
  [110, 115], [118, 119], [140, 143], [180, 182],
];

export const SAFARICOM_ONLY_MESSAGE =
  "Only Safaricom numbers are supported (for example 0712 345 678 or 0110 123 456). Please use a Safaricom number.";
export const INVALID_PHONE_MESSAGE = "Enter a valid Kenyan phone number, for example 0712345678.";

/** The 9 national digits (7XXXXXXXX / 1XXXXXXXX), or "" when the input is not a Kenyan mobile number. */
export function nationalDigits(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("254")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);           // "+254 (0)701..." style
  return /^[17]\d{8}$/.test(d) ? d : "";
}

export function isSafaricomNational(national: string): boolean {
  if (!/^[17]\d{8}$/.test(national)) return false;
  const prefix = Number(national.slice(0, 3));      // 701 -> 0701, 110 -> 0110
  return SAFARICOM_PREFIX_RANGES.some(([lo, hi]) => prefix >= lo && prefix <= hi);
}

export type PhoneCheck =
  | { ok: true; national: string; e164: string; msisdn: string; local: string }
  | { ok: false; reason: "invalid" | "not_safaricom"; message: string };

/** Format + Safaricom check. e164 = +2547XXXXXXXX, msisdn = 2547XXXXXXXX (HostPinnacle), local = 07XXXXXXXX. */
export function checkSafaricomPhone(raw: unknown): PhoneCheck {
  const national = nationalDigits(raw);
  if (!national) return { ok: false, reason: "invalid", message: INVALID_PHONE_MESSAGE };
  if (!isSafaricomNational(national)) return { ok: false, reason: "not_safaricom", message: SAFARICOM_ONLY_MESSAGE };
  return { ok: true, national, e164: `+254${national}`, msisdn: `254${national}`, local: `0${national}` };
}

/** Format only (no Safaricom rule) — for notifying accounts that already exist. Falls back to the digits when unrecognised. */
export function toMsisdn(raw: unknown): string {
  const n = nationalDigits(raw);
  return n ? `254${n}` : String(raw ?? "").replace(/\D/g, "");
}

/** Every way an existing document might have stored this number (string and numeric), for a Firestore `in` query. */
export function phoneStorageVariants(raw: unknown): Array<string | number> {
  const n = nationalDigits(raw);
  if (!n) return [];
  return [`+254${n}`, `254${n}`, `0${n}`, n, Number(n), Number(`254${n}`)];
}
