import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, translate, lwErrorKey, signInErrorKey } from './i18n.ts';
import type { LwCode, SignInErrorKind } from './types.ts';

test('every key exists in English and Kiswahili, with the same placeholders', () => {
  const en = Object.keys(STRINGS.en).sort();
  const sw = Object.keys(STRINGS.sw).sort();
  assert.deepEqual(sw, en);
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const k of en) {
    const key = k as keyof typeof STRINGS.en;
    assert.ok(STRINGS.sw[key].trim().length > 0, `empty sw: ${k}`);
    assert.equal(ph(STRINGS.sw[key]), ph(STRINGS.en[key]), `placeholders differ: ${k}`);
  }
});

test('glossary terms are used', () => {
  assert.match(STRINGS.sw['ov.commission'], /Kamisheni/);
  assert.match(STRINGS.sw['ov.netStill'], /Bado utapokea/);
  assert.match(STRINGS.sw['ov.net'], /Kiasi chako baada ya kamisheni/);
  assert.match(STRINGS.sw['mask.unlock'], /Fungua maelezo/);
  assert.equal(STRINGS.sw['app.tagline'], 'Fuatilia mali yako');
  assert.equal(STRINGS.sw['app.name'], 'Landlord Watch');
  assert.equal(STRINGS.sw['common.hidden'], 'Imefichwa');
});

test('money is never $ or Ksh in any string; KES price is not hard-coded', () => {
  for (const lang of ['en', 'sw'] as const) for (const [k, v] of Object.entries(STRINGS[lang])) {
    assert.ok(!/\$|Ksh/i.test(v), `${lang}:${k}`);
    assert.ok(!/KES\s*99/.test(v), `${lang}:${k} hard-codes the price`);
  }
});

test('translate fills placeholders; every contract error code has a message', () => {
  assert.equal(translate('en', 'auth.resendIn', { time: '0:42' }), 'Resend code in 0:42');
  assert.equal(translate('sw', 'tr.quota.free', { n: 1 }), 'Taarifa 1 bila malipo mwezi huu');
  const codes: LwCode[] = ['LW_BAD_OWNER_ID', 'LW_NOT_FOUND', 'LW_RATE_LIMITED', 'LW_NO_PHONE_ON_FILE', 'LW_OTP_COOLDOWN', 'LW_OTP_WRONG', 'LW_OTP_EXPIRED', 'LW_OTP_LOCKED', 'LW_SMS_FAILED', 'LW_LOCKED', 'LW_CONNECTION_LIMIT', 'LW_BAD_MONTH', 'LW_PAYMENT_FAILED', 'LW_NOT_ALLOWED', 'LW_UNAVAILABLE', 'LW_NETWORK'];
  for (const c of codes) assert.ok(STRINGS.en[lwErrorKey(c)], c);
  assert.equal(lwErrorKey('LW_OTP_WRONG', 2), 'err.LW_OTP_WRONG_LEFT');
  const kinds: SignInErrorKind[] = ['invalid_number', 'cooldown', 'sms_failed', 'wrong_code', 'expired', 'no_code', 'network', 'unknown'];
  for (const k of kinds) assert.ok(STRINGS.sw[signInErrorKey(k)], k);
});
