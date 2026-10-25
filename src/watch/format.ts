// Pure helpers: owner ID, months, dates, countdown. No React, no storage.
import type { Lang } from './types.ts';

export const OWNER_ID_RE = /^PYP-\d{4,}$/;

/** "pyp 0001", "PYP0001", " pyp-0001 " -> "PYP-0001". Returns '' when the text cannot be an owner ID. */
export function normaliseOwnerId(raw: string): string {
  const s = String(raw ?? '').toUpperCase().replace(/[\s_\u2010-\u2015-]+/g, '');
  const m = /^PYP(\d+)$/.exec(s);
  return m ? `PYP-${m[1]}` : '';
}
export function isValidOwnerId(id: string): boolean { return OWNER_ID_RE.test(id); }

export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SW = ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'];

const monthNames = (lang: Lang) => (lang === 'sw' ? MONTHS_SW : MONTHS_EN);

/** "2026-10" -> "October 2026" / "Oktoba 2026". Unknown input is returned as is. */
export function monthLabel(month: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${monthNames(lang)[idx]} ${m[1]}`;
}

/** "2026-10-15" -> "15 October 2026" / "15 Oktoba 2026". Date-only strings are never shifted by a time zone. */
export function dateLabel(date: string | null | undefined, lang: Lang): string {
  if (!date) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return date;
  return `${Number(m[3])} ${monthNames(lang)[idx]} ${m[1]}`;
}

const NAIROBI = 'Africa/Nairobi';

/** Current calendar month (YYYY-MM) in Africa/Nairobi. */
export function nairobiMonth(now: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: NAIROBI, year: 'numeric', month: '2-digit' }).formatToParts(new Date(now));
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}-${mo}`;
}

/** ISO instant -> "10 October 2026, 14:05" in Nairobi time. */
export function dateTimeLabel(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: NAIROBI, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(t));
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? '';
  return `${Number(g('day'))} ${monthNames(lang)[Number(g('month')) - 1]} ${g('year')}, ${g('hour')}:${g('minute')}`;
}

/** Seconds -> "m:ss" for countdowns. */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds left until `endsAt` (epoch ms), never negative. */
export function secondsLeft(endsAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Pull a wait time (seconds) out of a free-text server message such as "Please wait 42 seconds". */
export function parseWaitSeconds(message: string | undefined): number | undefined {
  if (!message) return undefined;
  const m = /(\d{1,4})\s*(?:s\b|sec|second)/i.exec(message) ?? /(\d{1,4})/.exec(message);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n > 0 && n <= 3600 ? n : undefined;
}

/** Format an amount the way the server does ("KES 99"). Only used for values the server sent (e.g. the transcript price). */
export function kesLabel(amount: number): string {
  const s = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, '');
  return `KES ${s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Keep only digits, at most `max`. */
export function digitsOnly(raw: string, max = 6): string { return raw.replace(/\D/g, '').slice(0, max); }
