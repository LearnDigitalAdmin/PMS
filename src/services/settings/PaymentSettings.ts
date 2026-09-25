// PaymentSettings.ts
// Single source of truth for the landlord's global payment instructions
// (M-Pesa till, bank details, custom instructions). Previously these were
// set manually inside the invoice-creation wizard on every invoice; they are
// now configured once here (surfaced in Profile settings) and every invoice
// simply forks a read-only copy of whatever is stored here at save time.

export interface PaymentInstructions {
  mpesaTillNumber?: string;
  bankName?: string;
  accountNumber?: string;
  customInstructions?: string;
}

const STORAGE_KEY = 'defaultPaymentInstructions';

export function getGlobalPaymentInstructions(): PaymentInstructions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveGlobalPaymentInstructions(instructions: PaymentInstructions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instructions));
  } catch {
    // Silently fail if localStorage is not available
  }
}

export function hasAnyPaymentInstructions(instructions: PaymentInstructions): boolean {
  return Boolean(
    instructions.mpesaTillNumber ||
    instructions.bankName ||
    instructions.customInstructions
  );
}
