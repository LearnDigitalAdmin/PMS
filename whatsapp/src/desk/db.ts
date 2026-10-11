import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { DESK } from "./constants";

export function fs(): Firestore {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

export interface AuditInput {
  action: string;
  agentId?: string;
  entityKey?: string;
  meta?: Record<string, unknown>;
}

/** Append-only audit row in desk's own `desk_audit` collection (same shape desk's kernel writes). Never throws into the caller's main flow unless `strict`. */
export async function writeAudit(entry: AuditInput, strict = false): Promise<void> {
  try {
    const clean: Record<string, unknown> = { action: entry.action, meta: entry.meta ?? {}, at: Date.now() };
    if (entry.agentId) clean.agentId = entry.agentId;
    if (entry.entityKey) clean.entityKey = entry.entityKey;
    await fs().collection(DESK.audit).doc().create(clean);
  } catch (err) {
    console.error("desk audit write failed", entry.action, err);
    if (strict) throw err;
  }
}
