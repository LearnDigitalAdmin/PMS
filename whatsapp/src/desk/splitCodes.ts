import axios from "axios";
import type { Firestore } from "firebase-admin/firestore";
import { DESK } from "./constants";
import { DeskError } from "./errors";
import { splitKey, validateSplit, type SplitSub } from "./splitKey";

/**
 * Get or create a Paystack percentage split ("all-proportional": the real fee is shared in proportion, the main account takes
 * the remainder). Identical request body to the kernel's getOrCreateSplitCode and the same cache collection.
 */
export async function getOrCreateDeskSplitCode(store: Firestore, secretKey: string, subs: readonly SplitSub[], label: string): Promise<string> {
  validateSplit(subs);
  const key = splitKey(subs);
  const ref = store.collection(DESK.splitCodes).doc(key);
  const cached = await ref.get();
  if (cached.exists) return String(cached.get("splitCode"));
  let splitCode: string;
  try {
    const res = await axios.post("https://api.paystack.co/split", {
      name: `Desk ${label} ${key.slice(0, 8)}`.slice(0, 100),
      type: "percentage",
      currency: "KES",
      subaccounts: subs.map((s) => ({ subaccount: s.subaccount, share: s.sharePct })),
      bearer_type: "all-proportional",
    }, { timeout: 15_000, headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" } });
    if (!res.data?.status || !res.data?.data?.split_code) throw new DeskError("internal", res.data?.message ?? "Could not create split");
    splitCode = String(res.data.data.split_code);
  } catch (err) {
    if (err instanceof DeskError) throw err;
    const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (err as Error)?.message ?? "Paystack error";
    throw new DeskError("internal", msg);
  }
  try {
    await ref.create({ splitCode, subs: subs.map((s) => ({ ...s })), label, createdAt: Date.now() });
    return splitCode;
  } catch (err) {
    if ((err as { code?: number }).code === 6) return String((await ref.get()).get("splitCode")); // a concurrent request cached first
    throw err;
  }
}
