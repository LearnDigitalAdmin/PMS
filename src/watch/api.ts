// The ONE typed client for Landlord Watch. Real implementation = Firebase callables (contract section 7);
// VITE_LW_MOCK=1 swaps in the in-memory mock (mock.ts). Nothing else in src/watch talks to the backend.
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, functions } from './firebase.ts';
import { toLwError, toSignInError } from './errors.ts';
import { createMockApi } from './mock.ts';
import type { WatchApi } from './api-types.ts';
import type { AuthState, Connection, LookupResult, OtpSent, Quota, SnapshotResponse, TranscriptRequest, UnlockResult } from './types.ts';

export type { WatchApi } from './api-types.ts';

export const IS_MOCK = import.meta.env.VITE_LW_MOCK === '1';

async function call<Req extends object, Res>(name: string, data: Req): Promise<Res> {
  try {
    const res = await httpsCallable<Req, Res>(functions, name)(data);
    return res.data;
  } catch (e) {
    throw toLwError(e);
  }
}

async function callSignIn<Req extends object, Res>(name: string, data: Req): Promise<Res> {
  try {
    const res = await httpsCallable<Req, Res>(functions, name)(data);
    return res.data;
  } catch (e) {
    throw toSignInError(e);
  }
}

function createRealApi(): WatchApi {
  return {
    auth: {
      onChange(cb) {
        let seq = 0;
        return onAuthStateChanged(auth, (user) => {
          const mine = ++seq;
          if (!user) { cb({ status: 'signedOut' }); return; }
          // A Watch session is a phone session: the ID token carries `otp_phone` (contract section 3).
          // A user signed in by e-mail for the normal PMS has no such claim and is not a Watch session.
          user.getIdTokenResult().then((t) => {
            if (mine !== seq) return;
            const phone = typeof t.claims.otp_phone === 'string' ? t.claims.otp_phone : null;
            const s: AuthState = phone ? { status: 'signedIn', phone } : { status: 'signedOut' };
            cb(s);
          }).catch(() => { if (mine === seq) cb({ status: 'signedOut' }); });
        });
      },
      sendOtp: (phone) => callSignIn<{ phone: string }, { ok: true; expiresInSec: number; resendInSec: number }>('sendLoginOtp', { phone }),
      async verifyOtp(phone, code) {
        const { token } = await callSignIn<{ phone: string; code: string }, { token: string }>('verifyLoginOtp', { phone, code });
        try { await signInWithCustomToken(auth, token); } catch (e) { throw toSignInError(e); }
      },
      async signOut() { await signOut(auth); },
    },
    lookupProperty: (ownerId) => call<{ ownerId: string; channel: 'pms' }, LookupResult>('lwLookupProperty', { ownerId, channel: 'pms' }),
    async connect(ownerId) { return (await call<{ ownerId: string }, { connection: Connection }>('lwConnect', { ownerId })).connection; },
    async disconnect(ownerId) { await call<{ ownerId: string }, { ok: true }>('lwDisconnect', { ownerId }); },
    async listConnections() { return (await call<Record<string, never>, { connections: Connection[] }>('lwListConnections', {})).connections; },
    unlockSendOtp: (ownerId, lang) => call<{ ownerId: string; lang?: string }, OtpSent>('lwUnlockSendOtp', { ownerId, lang }),
    unlockVerifyOtp: (ownerId, code) => call<{ ownerId: string; code: string }, UnlockResult>('lwUnlockVerifyOtp', { ownerId, code }),
    getSnapshot: (p) => call<typeof p, SnapshotResponse>('lwGetSnapshot', p),
    transcriptQuota: (ownerId) => call<{ ownerId: string }, Quota>('lwTranscriptQuota', { ownerId }),
    transcriptStart: (ownerId, month, lang) => call<{ ownerId: string; month: string; lang?: string }, TranscriptRequest>('lwTranscriptStart', { ownerId, month, lang }),
    transcriptResendOtp: (requestId) => call<{ requestId: string }, OtpSent>('lwTranscriptResendOtp', { requestId }),
    transcriptVerifyOtp: (requestId, code) => call<{ requestId: string; code: string }, TranscriptRequest>('lwTranscriptVerifyOtp', { requestId, code }),
    transcriptPay: (requestId, phone) => call<{ requestId: string; phone: string }, TranscriptRequest>('lwTranscriptPay', { requestId, phone }),
    transcriptStatus: (requestId) => call<{ requestId: string }, TranscriptRequest>('lwTranscriptStatus', { requestId }),
    transcriptList: (ownerId) => call<{ ownerId: string }, { items: TranscriptRequest[] }>('lwTranscriptList', { ownerId }),
  };
}

export const api: WatchApi = IS_MOCK ? createMockApi() : createRealApi();
