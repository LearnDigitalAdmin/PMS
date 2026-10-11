/**
 * Pure port of the desk kernel's share maths (functions-desk/src/money.ts + config.ts). Pinned to the kernel's test vectors
 * in shares.test.ts. Rates come from `desk_config/global` (merged over these defaults, exactly like the kernel).
 */
export type Rank = "clerk" | "senior" | "lead";
export interface ShareConfig { subShareByRank: Record<Rank, number>; reportShareByRank: Record<Rank, number> }
export interface SplitPlan { agentSharePct: number; rule: "subscription" | "report" }

export const DEFAULT_SHARE_CONFIG: ShareConfig = {
  subShareByRank: { clerk: 25, senior: 30, lead: 30 },
  reportShareByRank: { clerk: 25, senior: 30, lead: 30 },
};

/** 97.5 -> 9750 basis points. Shares are kept to 0.01%. */
export const toBps = (pct: number): number => Math.round(pct * 100);
/** Never overpay an agent: round DOWN to 0.01%. The epsilon guards binary-float artefacts (71.03 * 100). */
export const floorPct2 = (pct: number): number => Math.floor(pct * 100 + 1e-9) / 100;

export function mergeShareConfig(stored: Partial<ShareConfig> | undefined): ShareConfig {
  const s = stored ?? {};
  return {
    subShareByRank: { ...DEFAULT_SHARE_CONFIG.subShareByRank, ...s.subShareByRank },
    reportShareByRank: { ...DEFAULT_SHARE_CONFIG.reportShareByRank, ...s.reportShareByRank },
  };
}

export function sharePlan(rank: Rank, kind: "subscription" | "report", cfg: ShareConfig): SplitPlan {
  const pct = (kind === "subscription" ? cfg.subShareByRank : cfg.reportShareByRank)[rank];
  return { agentSharePct: floorPct2(pct), rule: kind };
}
