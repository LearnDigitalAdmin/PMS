/**
 * Normalise any Kenyan phone input — 07.., 01.., 7.., 1.., 254.., +254.. — to
 * the canonical 2547XXXXXXXX / 2541XXXXXXXX form the Cloud Functions expect.
 * Returns '' when the input can't be parsed into a valid Kenyan mobile number.
 */
export function normalizeKenyanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  if (digits.startsWith('254')) {
    return digits.length === 12 ? digits : '';
  }
  if (digits.startsWith('0')) {
    return digits.length === 10 ? `254${digits.substring(1)}` : '';
  }
  if (digits.startsWith('7') || digits.startsWith('1')) {
    return digits.length === 9 ? `254${digits}` : '';
  }
  return '';
  
}

export function isValidKenyanPhone(raw: string): boolean {
  return normalizeKenyanPhone(raw) !== '';
}
