import { defineSecret } from "firebase-functions/params";

/**
 * Single Secret Manager secret holding every app secret as one JSON object
 * ({ "PAYSTACK_SECRET_KEY": "...", ... }). Bind BUNDLE_SECRETS on a function and
 * read individual values through bundleSecret(NAME).value().
 */
export const APP_SECRETS_BUNDLE = defineSecret("app-secrets-bundle");
export const BUNDLE_SECRETS = [APP_SECRETS_BUNDLE];

let rawCache: string | undefined;
let parsedCache: Record<string, string> = {};

function readBundle(): Record<string, string> {
  const raw = APP_SECRETS_BUNDLE.value();
  if (!raw) return {};
  if (raw !== rawCache) {
    parsedCache = JSON.parse(raw) as Record<string, string>;
    rawCache = raw;
  }
  return parsedCache;
}

/** Drop-in for defineSecret(NAME) for reading: same .value() contract, backed by the bundle. */
export function bundleSecret(name: string): { readonly name: string; value(): string } {
  return {
    name,
    value: () => readBundle()[name] ?? process.env[name] ?? "",
  };
}
