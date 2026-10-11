/** Pure helpers: no Firebase imports, safe to unit-test directly. */
import { DESK_CODE_RE, DESK_TOP_CODE, EAT_OFFSET_MS, LANDLORD_CODE_PREFIX, LANDLORD_CODE_RE } from "./constants";
import { DeskError } from "./errors";

/** PYL-0001 … zero-padded to at least 4 digits; grows (PYL-10000) without truncation. */
export function formatLandlordCode(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`landlord counter must be a positive integer, got ${n}`);
  return `${LANDLORD_CODE_PREFIX}${String(n).padStart(4, "0")}`;
}
export const isLandlordCode = (s: unknown): s is string => typeof s === "string" && LANDLORD_CODE_RE.test(s);

/** Trim and upper-case a desk code typed by a person. Does not judge validity. */
export const normaliseDeskCode = (raw: unknown): string => (typeof raw === "string" ? raw.trim().toUpperCase() : "");
export const isDeskCode = (s: string): boolean => s === DESK_TOP_CODE || DESK_CODE_RE.test(s);

/** The calendar day in Nairobi (YYYY-MM-DD) for an epoch-ms instant; used for the per-day request limit. */
export function nairobiDayKey(nowMs: number): string {
  return new Date(nowMs + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Where a request goes, exactly like Chama:
 *  - the chosen desk (must be one of the landlord's connected desks), else the FIRST connected non-top desk,
 *  - else the top desk when no desk is connected,
 *  - plus the top desk when the landlord opts in.
 * `connected` is ordered by when each desk was added and never contains the top desk.
 */
export function routeDeskCodes(p: { connected: readonly string[]; chosen?: string; includeTop: boolean }): string[] {
  const connected = p.connected.filter((c) => c !== DESK_TOP_CODE);
  const chosen = normaliseDeskCode(p.chosen);
  let targets: string[];
  if (chosen && chosen !== DESK_TOP_CODE) {
    if (!connected.includes(chosen)) throw new DeskError("invalid_argument", "That desk is not one of your support agents");
    targets = [chosen];
  } else if (chosen === DESK_TOP_CODE) {
    targets = [];
  } else {
    targets = connected.length > 0 ? [connected[0]] : [];
  }
  if (targets.length === 0 || p.includeTop) targets = [...targets, DESK_TOP_CODE];
  return Array.from(new Set(targets));
}
