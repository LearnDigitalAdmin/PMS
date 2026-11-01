/** "Dear John" from "John Doe": every SMS greets by FIRST name only (cut at the first space). */
export function firstName(full: unknown, fallback = 'Customer'): string {
  const first = (typeof full === 'string' ? full.trim() : '').split(/\s+/)[0] ?? '';
  const clean = first.replace(/[^\p{L}'’-]/gu, '');
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : fallback;
}
