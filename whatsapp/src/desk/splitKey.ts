import { createHash } from "node:crypto";
import { DeskError } from "./errors";
import { toBps } from "./shares";

export interface SplitSub { subaccount: string; sharePct: number }

/** Same key the desk kernel uses, so PMS, PAY and desk all share one `desk_split_codes` cache entry per split. */
export function splitKey(subs: readonly SplitSub[]): string {
  const canon = [...subs].map((s) => `${s.subaccount}:${toBps(s.sharePct)}`).sort().join("|");
  return createHash("sha256").update(canon).digest("hex").slice(0, 32);
}

export function validateSplit(subs: readonly SplitSub[]): void {
  if (subs.length === 0) throw new DeskError("invalid_argument", "Split needs at least one subaccount");
  let total = 0;
  for (const s of subs) {
    if (!s.subaccount.startsWith("ACCT_")) throw new DeskError("invalid_argument", "Invalid Paystack subaccount code");
    if (!(s.sharePct > 0 && s.sharePct < 100)) throw new DeskError("invalid_argument", "Split share must be between 0 and 100");
    total += toBps(s.sharePct);
  }
  if (total >= 10000) throw new DeskError("invalid_argument", "Split shares leave nothing for the platform");
}
