import { httpsCallable, getFunctions } from 'firebase/functions';
import { app } from './database/FirebaseSync';

// Desk callables run in us-central1; other PMS functions stay on africa-south1.
const functions = getFunctions(app, 'us-central1');

export interface SupportAgent { agentCode: string; name: string; addedAt: number; locked?: boolean }
export interface SupportAgentsState { agents: SupportAgent[]; landlordCode: string; maxAgents: number }
export type DeskRequestStatus = 'new' | 'open' | 'answered' | 'closed';
export interface DeskRequestResponse { at: number; byDeskCode: string; text: string }
export interface DeskRequest {
  id: string; category: string; subject: string; message: string; status: DeskRequestStatus;
  targetDeskCodes: string[]; responses: DeskRequestResponse[]; createdAt: number; updatedAt: number;
}
export interface DeskRequestsState { requests: DeskRequest[]; landlordCode: string; dailyLimit: number }
export interface CreateDeskRequestInput { category: string; subject: string; message: string; deskCode?: string; includeTopDesk: boolean }

export const DESK_TOP_CODE = 'COG-0000';
export const REQUEST_CATEGORIES: { value: string; label: string }[] = [
  { value: 'setup', label: 'Setting up my account' }, { value: 'import', label: 'Importing tenants' },
  { value: 'sms', label: 'SMS and credits' }, { value: 'payments', label: 'Payments' },
  { value: 'reports', label: 'Reports' }, { value: 'account', label: 'My account' }, { value: 'other', label: 'Something else' },
];

/** Firebase callable errors carry the server's user-readable message; fall back to a generic one. */
export function errorText(err: unknown, fallback: string): string {
  const m = (err as { message?: string } | null)?.message;
  return m && !/^internal$/i.test(m) ? m.replace(/^.*?:\s*(?=[A-Z])/, '') : fallback;
}

const call = <I, O>(name: string) => async (data: I): Promise<O> => (await httpsCallable<I, O>(functions, name)(data)).data;
export const listSupportAgents = call<Record<string, never>, SupportAgentsState>('listSupportAgents');
export const addSupportAgent = call<{ agentCode: string }, { ok: boolean }>('addSupportAgent');
export const removeSupportAgent = call<{ agentCode: string }, { ok: boolean }>('removeSupportAgent');
export const createDeskRequest = call<CreateDeskRequestInput, { id: string; targetDeskCodes: string[] }>('createDeskRequest');
export const listDeskRequests = call<Record<string, never>, DeskRequestsState>('listDeskRequests');
