/**
 * Plan expiry maths, kept pure so it can be tested.
 *
 * Paying BEFORE the current paid plan ends must not throw away the days already paid for: the new period is added on
 * top of the existing expiry. A trial, a plan that already ended, or an account with no expiry starts from today.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpiryUserDoc {
  type?: unknown;
  isTrial?: unknown;
  subscriptionExpiry?: { toDate?: () => Date } | Date | null;
}

function readExpiry(value: ExpiryUserDoc["subscriptionExpiry"]): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : typeof value.toDate === "function" ? value.toDate() : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** The moment the new period starts counting from. */
export function renewalBase(user: ExpiryUserDoc | undefined, now: Date = new Date()): Date {
  const current = readExpiry(user?.subscriptionExpiry);
  const stillActivePaid = user?.type === "paid" && user?.isTrial !== true && current !== null && current.getTime() > now.getTime();
  return stillActivePaid ? current : now;
}

/** New expiry after paying for `daysToAdd` days. */
export function renewedExpiry(user: ExpiryUserDoc | undefined, daysToAdd: number, now: Date = new Date()): Date {
  return new Date(renewalBase(user, now).getTime() + daysToAdd * DAY_MS);
}
