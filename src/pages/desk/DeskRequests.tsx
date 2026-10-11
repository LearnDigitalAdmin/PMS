import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import {
  createDeskRequest, DESK_TOP_CODE, errorText, listDeskRequests, listSupportAgents, REQUEST_CATEGORIES,
  type DeskRequest, type DeskRequestStatus, type DeskRequestsState, type SupportAgent,
} from '../../services/desk';

const STATUS_STYLE: Record<DeskRequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  open: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  answered: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  closed: 'bg-surface-sunken text-ink-muted',
};
const STATUS_LABEL: Record<DeskRequestStatus, string> = { new: 'Sent', open: 'Being handled', answered: 'Answered', closed: 'Closed' };
const when = (ms: number) => new Date(ms).toLocaleString();

const DeskRequests: React.FC = () => {
  const [state, setState] = useState<DeskRequestsState | null>(null);
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [loadError, setLoadError] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [deskCode, setDeskCode] = useState('');
  const [includeTop, setIncludeTop] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [reqs, ag] = await Promise.all([listDeskRequests({}), listSupportAgents({})]);
      setState(reqs); setAgents(ag.agents.filter((a) => a.agentCode !== DESK_TOP_CODE));
    } catch (e) { setLoadError(errorText(e, 'Could not load your requests. Check your connection and try again.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) { setNotice({ kind: 'error', text: 'Choose a category.' }); return; }
    if (subject.trim().length < 3) { setNotice({ kind: 'error', text: 'Add a short subject (at least 3 characters).' }); return; }
    if (message.trim().length < 5) { setNotice({ kind: 'error', text: 'Describe what you need help with.' }); return; }
    setSending(true); setNotice(null);
    try {
      const out = await createDeskRequest({ category, subject: subject.trim(), message: message.trim(), deskCode: deskCode || undefined, includeTopDesk: includeTop });
      setNotice({ kind: 'ok', text: `Request sent to ${out.targetDeskCodes.join(' and ')}.` });
      setSubject(''); setMessage(''); setCategory(''); setIncludeTop(false);
      await load();
    } catch (err) { setNotice({ kind: 'error', text: errorText(err, 'Could not send your request. Please try again.') }); }
    finally { setSending(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">Desk requests</h1>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">Ask for help</h2>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink" aria-label="Category">
          <option value="">What is this about?</option>
          {REQUEST_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Subject" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink" />
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} placeholder="Tell us what you need" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink" />
        {agents.length > 0 && (
          <select value={deskCode} onChange={(e) => setDeskCode(e.target.value)} className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink" aria-label="Which desk">
            <option value="">Send to my first connected desk ({agents[0].agentCode})</option>
            {agents.map((a) => <option key={a.agentCode} value={a.agentCode}>{a.agentCode} · {a.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={includeTop} onChange={(e) => setIncludeTop(e.target.checked)} /> Also send to the Samuhia top desk ({DESK_TOP_CODE})
        </label>
        {agents.length === 0 && <p className="text-sm text-ink-muted">You have no connected desk, so this goes to the Samuhia top desk.</p>}
        {notice && <p role="status" className={`text-sm ${notice.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{notice.text}</p>}
        <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request
        </button>
        {state && <p className="text-xs text-ink-muted">You can send {state.dailyLimit} requests per day.</p>}
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Your requests</h2>
        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {loadError} <button onClick={() => void load()} className="ml-2 font-semibold underline">Retry</button>
          </div>
        )}
        {!state && !loadError && <div className="flex items-center gap-2 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>}
        {state && state.requests.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-ink-muted">You have not sent any requests yet.</p>}
        {state?.requests.map((r: DeskRequest) => (
          <article key={r.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold text-ink">{r.subject}</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status] ?? STATUS_STYLE.new}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">{r.message}</p>
            <p className="mt-2 text-xs text-ink-muted">{when(r.createdAt)} · to {r.targetDeskCodes.join(', ')}</p>
            {r.responses.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                {r.responses.map((resp, i) => (
                  <div key={i} className="rounded-lg bg-surface-sunken p-3 text-sm">
                    <div className="text-xs text-ink-muted">{resp.byDeskCode} · {when(resp.at)}</div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-ink">{resp.text}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
};
export default DeskRequests;
