import type { Firestore } from "firebase-admin/firestore";
import type { AttributionDeps } from "./attribution";
import { DESK } from "./constants";
import { mergeShareConfig, type ShareConfig } from "./shares";
import { getOrCreateDeskSplitCode } from "./splitCodes";

/** Production readers over the shared database. `legacy` is supplied by index.ts so today's legacy code path is reused untouched. */
export function firestoreAttributionDeps(store: Firestore, secretKey: string, legacy: AttributionDeps["legacySplitCode"]): AttributionDeps {
  return {
    async getLandlord(uid) {
      const s = await store.collection("users").doc(uid).get();
      return s.exists ? { landlordCode: s.get("landlordCode"), cyberId: s.get("cyberId") } : null;
    },
    async getCustomer(entityKey) {
      const s = await store.collection(DESK.customers).doc(entityKey.replace(/\//g, "_")).get();
      return s.exists ? { ownerAgentId: s.get("ownerAgentId"), selfOwned: s.get("selfOwned") } : null;
    },
    async getDeskAgent(agentId) {
      const s = await store.collection(DESK.agents).doc(agentId).get();
      return s.exists ? { agentCode: s.get("agentCode"), status: s.get("status"), rank: s.get("rank") } : null;
    },
    async getMainSubaccount(agentId) {
      const s = await store.collection("agents").doc(agentId).get();
      const id = s.exists ? s.get("paymentInfo.accountId") : undefined;
      return typeof id === "string" && id ? id : undefined;
    },
    async getShareConfig() {
      const s = await store.collection(DESK.config).doc("global").get();
      return mergeShareConfig(s.exists ? (s.data() as Partial<ShareConfig>) : undefined);
    },
    getSplitCode: (subs, label) => getOrCreateDeskSplitCode(store, secretKey, subs, label),
    legacySplitCode: legacy,
  };
}
