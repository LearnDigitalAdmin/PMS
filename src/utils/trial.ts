/**
 * Days remaining until a trial/subscription expiry, rounded up so "expires
 * later today" still reads as 1 day rather than 0. Returns null when there's
 * no expiry to compute from, and 0 (never negative) once it has passed.
 */
export function getDaysRemaining(expiryIso: string | null | undefined): number | null {
  if (!expiryIso) return null;
  const expiry = new Date(expiryIso).getTime();
  if (Number.isNaN(expiry)) return null;

  const diffMs = expiry - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
