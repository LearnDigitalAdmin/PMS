import test from 'node:test';
import assert from 'node:assert/strict';
import { toLwError, toSignInError } from './errors.ts';

test('callable errors: branch on details.lw', () => {
  const e = toLwError({ code: 'functions/failed-precondition', message: 'whatever', details: { lw: 'LW_OTP_WRONG', attemptsLeft: 3 } }, true);
  assert.equal(e.lw, 'LW_OTP_WRONG');
  assert.equal(e.attemptsLeft, 3);
  const c = toLwError({ code: 'functions/resource-exhausted', details: { lw: 'LW_OTP_COOLDOWN', retryAfterSec: 42 } }, true);
  assert.deepEqual([c.lw, c.retryAfterSec], ['LW_OTP_COOLDOWN', 42]);
});
test('callable errors: unknown details -> LW_UNAVAILABLE, offline -> LW_NETWORK, message text is ignored', () => {
  assert.equal(toLwError({ code: 'functions/internal', message: 'LW_OTP_WRONG' }, true).lw, 'LW_UNAVAILABLE');
  assert.equal(toLwError({ code: 'functions/internal', details: { lw: 'LW_MADE_UP' } }, true).lw, 'LW_UNAVAILABLE');
  assert.equal(toLwError({ code: 'functions/unavailable' }, true).lw, 'LW_NETWORK');
  assert.equal(toLwError(new Error('x'), false).lw, 'LW_NETWORK');
});
test('sign-in callables map Firebase codes', () => {
  assert.equal(toSignInError({ code: 'functions/invalid-argument' }, true).kind, 'invalid_number');
  const r = toSignInError({ code: 'functions/resource-exhausted', message: 'Please wait 37 seconds before requesting a new code' }, true);
  assert.deepEqual([r.kind, r.retryAfterSec], ['cooldown', 37]);
  assert.equal(toSignInError({ code: 'functions/permission-denied' }, true).kind, 'wrong_code');
  assert.equal(toSignInError({ code: 'functions/deadline-exceeded' }, true).kind, 'expired');
  assert.equal(toSignInError({ code: 'functions/failed-precondition' }, true).kind, 'no_code');
  assert.equal(toSignInError({ code: 'functions/unavailable' }, true).kind, 'sms_failed');
  assert.equal(toSignInError({ code: 'functions/unavailable' }, false).kind, 'network');
});
