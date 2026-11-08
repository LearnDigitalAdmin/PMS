import { bundleSecret } from "../secretsBundle";
import type { ReportsPort } from "./delegate";

/** CR_SERVER_URL and CR_SERVER_KEY live in the app secrets bundle (the same JSON secret PAY reads). */
const CR_SERVER_URL = bundleSecret("CR_SERVER_URL");
const CR_SERVER_KEY = bundleSecret("CR_SERVER_KEY");
const TIMEOUT_MS = 150_000;                                   // Chromium cold start + PDF

/** Production ReportsPort: POST to PAY's crServerApi with the shared key. Never throws for a refusal; network trouble becomes an error the delegate retries. */
export function payReportsPort(fetchImpl: typeof fetch = fetch): ReportsPort {
  return {
    async call(body) {
      const url = CR_SERVER_URL.value(), key = CR_SERVER_KEY.value();
      if (!url || !key) return { ok: false, error: { code: "CR_UNAVAILABLE", message: "Reports are not configured" } };
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", "x-cr-key": key }, body: JSON.stringify(body), signal: ctl.signal });
        const json = (await res.json()) as { ok?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } };
        if (json.ok && json.data) return { ok: true, data: json.data };
        return { ok: false, error: { code: String(json.error?.code ?? "CR_UNAVAILABLE"), message: String(json.error?.message ?? "The report could not be made") } };
      } catch (e) {
        throw new Error(`report engine unreachable: ${e instanceof Error ? e.message : e}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
