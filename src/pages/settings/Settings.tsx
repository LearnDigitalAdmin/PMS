import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Lock, LifeBuoy, Loader2, Plus, Trash2, UserCheck } from 'lucide-react';
import { addSupportAgent, DESK_TOP_CODE, errorText, listSupportAgents, removeSupportAgent, type SupportAgentsState } from '../../services/desk';

const Settings: React.FC = () => {
  const [state, setState] = useState<SupportAgentsState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try { setState(await listSupportAgents({})); }
    catch (e) { setLoadError(errorText(e, 'Could not load your settings. Check your connection and try again.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connected = state ? state.agents.filter((a) => a.agentCode !== DESK_TOP_CODE).length : 0;
  const full = state ? connected >= state.maxAgents : false;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!/^COG-\d{4,}$/.test(value)) { setMessage({ kind: 'error', text: 'Enter a desk code like COG-0001.' }); return; }
    setBusy('add'); setMessage(null);
    try { await addSupportAgent({ agentCode: value }); setCode(''); setMessage({ kind: 'ok', text: `${value} can now help with your account.` }); await load(); }
    catch (err) { setMessage({ kind: 'error', text: errorText(err, 'Could not add that desk. Please try again.') }); }
    finally { setBusy(null); }
  };
  const remove = async (agentCode: string) => {
    if (!window.confirm(`Remove ${agentCode}? They will no longer be able to help with your account.`)) return;
    setBusy(agentCode); setMessage(null);
    try { await removeSupportAgent({ agentCode }); setMessage({ kind: 'ok', text: `${agentCode} was removed.` }); await load(); }
    catch (err) { setMessage({ kind: 'error', text: errorText(err, 'Could not remove that desk. Please try again.') }); }
    finally { setBusy(null); }
  };
  const copy = async () => {
    if (!state) return;
    try { await navigator.clipboard.writeText(state.landlordCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the code is visible on screen */ }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">Settings</h1>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {loadError} <button onClick={() => void load()} className="ml-2 font-semibold underline">Retry</button>
        </div>
      )}
      {!state && !loadError && <div className="flex items-center gap-2 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>}

      {state && (
        <>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold text-ink">Your landlord code</h2>
            <p className="mt-1 text-sm text-ink-muted">Share this code with a Samuhia desk agent so they can find your account. It never changes.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-surface-sunken px-4 py-2 font-mono text-xl font-bold tracking-wider text-ink">{state.landlordCode}</span>
              <button onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface-sunken">
                <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold text-ink">Support agents</h2>
            <p className="mt-1 text-sm text-ink-muted">Desks you allow to help with your account, such as importing tenants or sending reminders. You can connect up to {state.maxAgents}.</p>

            <ul className="mt-4 divide-y divide-line">
              {state.agents.map((a) => (
                <li key={a.agentCode} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {a.locked ? <Lock className="h-5 w-5 shrink-0 text-ink-muted" /> : <UserCheck className="h-5 w-5 shrink-0 text-green-600" />}
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-ink">{a.agentCode}</div>
                      <div className="truncate text-sm text-ink-muted">{a.name}{a.locked ? ' · always connected' : ''}</div>
                    </div>
                  </div>
                  {!a.locked && (
                    <button onClick={() => void remove(a.agentCode)} disabled={busy !== null} aria-label={`Remove ${a.agentCode}`}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10">
                      {busy === a.agentCode ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {connected === 0 && <p className="mt-2 text-sm text-ink-muted">No desk connected yet. Requests you send go to the Samuhia top desk.</p>}

            <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="COG-0001" maxLength={12} disabled={full || busy !== null}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono uppercase text-ink disabled:opacity-50" aria-label="Desk code" />
              <button type="submit" disabled={full || busy !== null || !code.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add desk
              </button>
            </form>
            {full && <p className="mt-2 text-sm text-ink-muted">You have connected {state.maxAgents} desks. Remove one to add another.</p>}
            {message && <p role="status" className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
          </section>

          <Link to="/desk-requests" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-5 hover:bg-surface-sunken">
            <LifeBuoy className="h-6 w-6 text-blue-600" />
            <div><div className="font-semibold text-ink">Desk requests</div><div className="text-sm text-ink-muted">Ask a desk for help and see their replies.</div></div>
          </Link>
        </>
      )}
    </div>
  );
};
export default Settings;
