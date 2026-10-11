/**
 * Server-side subscription attribution. Replaces the old client-supplied `cyber` object, which let any caller choose who earned
 * the commission. Resolution order for a landlord:
 *   (a) the desk that owns the landlord (desk_customers/pms:<landlordCode>): rank share, split cached in desk_split_codes;
 *   (b) the legacy agent recorded on the landlord (users/{uid}.cyberId): today's behaviour exactly (45%, agentId in metadata);
 *   (c) nobody: no split.
 * A desk failure never blocks the subscription: it is logged and resolution continues.
 */
import { sharePlan, type Rank, type ShareConfig } from "./shares";
import type { SplitSub } from "./splitKey";

export interface DeskCommission { agentCode: string; agentId: string; sharePct: number; rule: string; entityKey: string }
export type Attribution =
  | { kind: "desk"; splitCode: string; commission: DeskCommission }
  | { kind: "legacy"; splitCode?: string; agentId: string }
  | { kind: "none" };

export interface AttributionDeps {
  /** users/{uid}: only the two attribution fields are needed. */
  getLandlord(uid: string): Promise<{ landlordCode?: string; cyberId?: unknown } | null>;
  getCustomer(entityKey: string): Promise<{ ownerAgentId?: string; selfOwned?: boolean } | null>;
  getDeskAgent(agentId: string): Promise<{ agentCode?: string; status?: string; rank?: string } | null>;
  /** agents/{id}.paymentInfo.accountId: the agent's MAIN Paystack subaccount (Plot Yangu charges through the main account). */
  getMainSubaccount(agentId: string): Promise<string | undefined>;
  getShareConfig(): Promise<ShareConfig>;
  getSplitCode(subs: SplitSub[], label: string): Promise<string>;
  /** Today's legacy path (45% to the agent through splitCodes/{agentId}); resolves to undefined when the agent has no payment account. */
  legacySplitCode(agentId: string): Promise<string | undefined>;
}

const RANKS: Rank[] = ["clerk", "senior", "lead"];

/** `cyberId` is the legacy agent's uid, stored as a string (an object with `uid` is also accepted). */
export function legacyAgentId(cyberId: unknown): string | undefined {
  if (typeof cyberId === "string" && cyberId.trim()) return cyberId.trim();
  const uid = (cyberId as { uid?: unknown } | null | undefined)?.uid;
  return typeof uid === "string" && uid.trim() ? uid.trim() : undefined;
}

async function resolveDesk(deps: AttributionDeps, landlordCode: string): Promise<Attribution | null> {
  const entityKey = `pms:${landlordCode}`;
  const customer = await deps.getCustomer(entityKey);
  if (!customer || customer.selfOwned || !customer.ownerAgentId) return null;
  const agent = await deps.getDeskAgent(customer.ownerAgentId);
  if (!agent || agent.status !== "active" || !agent.agentCode || !RANKS.includes(agent.rank as Rank)) return null;
  const subaccount = await deps.getMainSubaccount(customer.ownerAgentId);
  if (!subaccount) return null;
  const plan = sharePlan(agent.rank as Rank, "subscription", await deps.getShareConfig());
  if (!(plan.agentSharePct > 0 && plan.agentSharePct < 100)) return null;
  const splitCode = await deps.getSplitCode([{ subaccount, sharePct: plan.agentSharePct }], `pms ${agent.agentCode}`);
  return {
    kind: "desk", splitCode,
    commission: { agentCode: agent.agentCode, agentId: customer.ownerAgentId, sharePct: plan.agentSharePct, rule: plan.rule, entityKey },
  };
}

export async function resolveSubscriptionAttribution(deps: AttributionDeps, uid: string): Promise<Attribution> {
  let landlord: Awaited<ReturnType<AttributionDeps["getLandlord"]>> = null;
  try { landlord = await deps.getLandlord(uid); } catch (err) { console.error("attribution: landlord read failed", err); }

  if (landlord?.landlordCode) {
    try {
      const desk = await resolveDesk(deps, landlord.landlordCode);
      if (desk) return desk;
    } catch (err) {
      console.error(`attribution: desk resolution failed for ${landlord.landlordCode}; continuing without it`, err);
    }
  }

  const legacyId = legacyAgentId(landlord?.cyberId);
  if (legacyId) {
    let splitCode: string | undefined;
    try { splitCode = await deps.legacySplitCode(legacyId); } catch (err) {
      console.error(`attribution: legacy split failed for agent ${legacyId}; continuing without a split`, err);
    }
    return { kind: "legacy", agentId: legacyId, splitCode };
  }
  return { kind: "none" };
}
