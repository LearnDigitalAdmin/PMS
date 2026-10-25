// The typed surface of the Landlord Watch backend as the UI sees it (real and mock implement the same interface).
import type {
  AuthState, Connection, Lang, LookupResult, OtpSent, Quota, SnapshotResponse, TranscriptRequest, UnlockResult,
} from './types.ts';

export interface WatchApi {
  auth: {
    /** Calls back with the current state, then on every change. Returns an unsubscribe function. */
    onChange(cb: (s: AuthState) => void): () => void;
    sendOtp(phoneE164: string): Promise<{ expiresInSec: number; resendInSec: number }>;
    verifyOtp(phoneE164: string, code: string): Promise<void>;
    signOut(): Promise<void>;
  };
  lookupProperty(ownerId: string): Promise<LookupResult>;
  connect(ownerId: string): Promise<Connection>;
  disconnect(ownerId: string): Promise<void>;
  listConnections(): Promise<Connection[]>;
  unlockSendOtp(ownerId: string, lang?: Lang): Promise<OtpSent>;
  unlockVerifyOtp(ownerId: string, code: string): Promise<UnlockResult>;
  getSnapshot(p: { ownerId: string; month?: string; lang?: Lang; ifNoneMatch?: string }): Promise<SnapshotResponse>;
  transcriptQuota(ownerId: string): Promise<Quota>;
  transcriptStart(ownerId: string, month: string, lang?: Lang): Promise<TranscriptRequest>;
  transcriptResendOtp(requestId: string): Promise<OtpSent>;
  transcriptVerifyOtp(requestId: string, code: string): Promise<TranscriptRequest>;
  transcriptPay(requestId: string, phoneE164: string): Promise<TranscriptRequest>;
  transcriptStatus(requestId: string): Promise<TranscriptRequest>;
  transcriptList(ownerId: string): Promise<{ items: TranscriptRequest[] }>;
}
