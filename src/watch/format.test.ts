import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseOwnerId, isValidOwnerId, monthLabel, dateLabel, nairobiMonth, formatCountdown, secondsLeft, parseWaitSeconds, kesLabel, digitsOnly, dateTimeLabel } from './format.ts';
import { cooldownEndsAt, canResend } from './otp.ts';

test('owner id normalisation', () => {
  assert.equal(normaliseOwnerId(' pyp 0001 '), 'PYP-0001');
  assert.equal(normaliseOwnerId('pyp0001'), 'PYP-0001');
  assert.equal(normaliseOwnerId('PYP-10000'), 'PYP-10000');
  assert.equal(normaliseOwnerId('ABC-0001'), '');
  assert.ok(isValidOwnerId('PYP-0001'));
  assert.ok(isValidOwnerId('PYP-12345'));
  assert.ok(!isValidOwnerId('PYP-001'));
  assert.ok(!isValidOwnerId('pyp-0001'));
});

test('month and date labels in both languages', () => {
  assert.equal(monthLabel('2026-10', 'en'), 'October 2026');
  assert.equal(monthLabel('2026-10', 'sw'), 'Oktoba 2026');
  assert.equal(monthLabel('2026-03', 'sw'), 'Machi 2026');
  assert.equal(dateLabel('2026-10-10', 'sw'), '10 Oktoba 2026');
  assert.equal(dateLabel('2026-10-05', 'en'), '5 October 2026');
  assert.equal(dateLabel(null, 'en'), '');
  assert.equal(monthLabel('garbage', 'en'), 'garbage');
});

test('Nairobi month rolls over at local midnight', () => {
  assert.equal(nairobiMonth(Date.parse('2026-10-31T20:59:00Z')), '2026-10'); // 23:59 EAT
  assert.equal(nairobiMonth(Date.parse('2026-10-31T21:00:00Z')), '2026-11'); // 00:00 EAT
  assert.equal(dateTimeLabel('2026-10-23T08:00:00.000Z', 'en'), '23 October 2026, 11:00');
});

test('countdown helpers', () => {
  assert.equal(formatCountdown(60), '1:00');
  assert.equal(formatCountdown(9), '0:09');
  assert.equal(formatCountdown(-3), '0:00');
  assert.equal(secondsLeft(10_000, 4_100), 6);
  assert.equal(secondsLeft(10_000, 20_000), 0);
  const end = cooldownEndsAt(1000, 60);
  assert.equal(end, 61_000);
  assert.ok(!canResend(end, 60_999));
  assert.ok(canResend(end, 61_000));
  assert.equal(cooldownEndsAt(0, undefined), 60_000);
});

test('misc formatters', () => {
  assert.equal(parseWaitSeconds('Please wait 42 seconds'), 42);
  assert.equal(parseWaitSeconds('slow down'), undefined);
  assert.equal(kesLabel(99), 'KES 99');
  assert.equal(kesLabel(125000), 'KES 125,000');
  assert.equal(kesLabel(1250.5), 'KES 1,250.5');
  assert.equal(digitsOnly('12 34-56789'), '123456');
});
