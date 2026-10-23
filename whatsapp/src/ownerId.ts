/** Property owner ids: PYP-NNNN, a 4-digit scaling number that simply grows to 5 digits after PYP-9999. */
export const OWNER_ID_PATTERN = /^PYP-\d{4,}$/;

export function formatOwnerId(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid owner counter: ${n}`);
  return `PYP-${String(n).padStart(4, "0")}`;
}
