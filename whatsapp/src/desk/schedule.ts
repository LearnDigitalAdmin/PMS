/** SMS schedule maths. Pure. All wall-clock times are Africa/Nairobi (fixed UTC+3). */
import { EAT_OFFSET_MS } from "./constants";
import { DeskError } from "./errors";

export type ScheduleKind = "once" | "daily" | "weekly" | "monthly";
export interface ScheduleSpec { kind: ScheduleKind; at: string; days?: number[] }

const DAY_MS = 86_400_000;
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const KINDS: ScheduleKind[] = ["once", "daily", "weekly", "monthly"];

/** `at` for "once" is a date-time (no zone = Nairobi time); for the recurring kinds it is "HH:mm" (a full date-time's time of day is also accepted). */
export function parseOnce(at: string): number | null {
  const s = String(at).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) return null;
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/.test(s);
  const ms = Date.parse(hasZone ? s : `${s}Z`);
  if (!Number.isFinite(ms)) return null;
  return hasZone ? ms : ms - EAT_OFFSET_MS;
}
function timeOfDay(at: string): { h: number; m: number } | null {
  const hm = HM_RE.exec(String(at).trim());
  if (hm) return { h: Number(hm[1]), m: Number(hm[2]) };
  const once = parseOnce(at);
  if (once === null) return null;
  const d = new Date(once + EAT_OFFSET_MS);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

export function validateSchedule(spec: unknown, nowMs: number): ScheduleSpec {
  const s = spec as Partial<ScheduleSpec> | null;
  if (!s || typeof s !== "object" || !KINDS.includes(s.kind as ScheduleKind)) throw new DeskError("invalid_argument", "Schedule kind must be once, daily, weekly or monthly");
  const kind = s.kind as ScheduleKind;
  const at = String(s.at ?? "").trim();
  if (kind === "once") {
    const t = parseOnce(at);
    if (t === null) throw new DeskError("invalid_argument", "Choose a date and time like 2026-11-05T09:00");
    if (t < nowMs + 60_000) throw new DeskError("invalid_argument", "The send time must be in the future");
    if (t > nowMs + 366 * DAY_MS) throw new DeskError("invalid_argument", "The send time must be within one year");
    return { kind, at };
  }
  if (!timeOfDay(at)) throw new DeskError("invalid_argument", "Choose a time of day like 09:00");
  if (kind === "daily") return { kind, at };
  const days = Array.isArray(s.days) ? Array.from(new Set(s.days.map(Number))).sort((a, b) => a - b) : [];
  if (days.length === 0) throw new DeskError("invalid_argument", kind === "weekly" ? "Choose at least one weekday (0 = Sunday … 6 = Saturday)" : "Choose at least one day of the month (1-31)");
  const [lo, hi] = kind === "weekly" ? [0, 6] : [1, 31];
  if (days.some((d) => !Number.isInteger(d) || d < lo || d > hi)) throw new DeskError("invalid_argument", kind === "weekly" ? "Weekdays must be 0 (Sunday) to 6 (Saturday)" : "Days of the month must be 1 to 31");
  return { kind, at, days };
}

const daysInMonth = (y: number, m0: number): number => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** The first run strictly after `afterMs`, or null when a one-off has passed. A monthly day beyond the month's length runs on its last day. */
export function nextRunAt(spec: ScheduleSpec, afterMs: number): number | null {
  if (spec.kind === "once") {
    const t = parseOnce(spec.at);
    return t !== null && t > afterMs ? t : null;
  }
  const tod = timeOfDay(spec.at);
  if (!tod) return null;
  const startDay = Math.floor((afterMs + EAT_OFFSET_MS) / DAY_MS);
  for (let off = 0; off <= 400; off++) {
    const dayStart = (startDay + off) * DAY_MS; // local midnight expressed as a UTC-shifted instant
    const d = new Date(dayStart);
    const matches =
      spec.kind === "daily" ||
      (spec.kind === "weekly" && (spec.days ?? []).includes(d.getUTCDay())) ||
      (spec.kind === "monthly" && (spec.days ?? []).some((x) => Math.min(x, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())) === d.getUTCDate()));
    if (!matches) continue;
    const candidate = dayStart + (tod.h * 60 + tod.m) * 60_000 - EAT_OFFSET_MS;
    if (candidate > afterMs) return candidate;
  }
  return null;
}
