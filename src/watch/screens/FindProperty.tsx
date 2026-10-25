import { useState } from 'react';
import type { FormEvent } from 'react';
import { Building2, CheckCircle2, Lock, Search, ShieldCheck } from 'lucide-react';
import { api } from '../api.ts';
import { Button, Card, InlineError } from '../components/ui.tsx';
import { useErrorText, useWatch } from '../useWatch.tsx';
import { formatCountdown, isValidOwnerId, normaliseOwnerId } from '../format.ts';
import type { LookupResult } from '../types.ts';

type Found = NonNullable<LookupResult['property']>;

/** Find by Owner ID -> show general data only -> "Connect this property to your account?" Yes / No. */
export default function FindProperty({ first, onDone, onCancel }: { first?: boolean; onDone: () => void; onCancel?: () => void }) {
  const { t, addConnection, connections } = useWatch();
  const errText = useErrorText();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [connecting, setConnecting] = useState(false);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const id = normaliseOwnerId(raw);
    if (!isValidOwnerId(id)) { setError(t('find.badFormat')); return; }
    setRaw(id); setBusy(true); setError(null); setFound(null);
    try {
      const r = await api.lookupProperty(id);
      if (!r.found || !r.property) setError(t('find.notFound')); else setFound(r.property);
    } catch (err) { setError(errText(err, formatCountdown)); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    if (!found || connecting) return;
    setConnecting(true); setError(null);
    try { const c = await api.connect(found.ownerId); addConnection(c); onDone(); }
    catch (err) { setError(errText(err, formatCountdown)); setConnecting(false); }
  };

  const already = !!found && connections.some((c) => c.ownerId === found.ownerId);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {first ? <p className="mb-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{t('find.firstTime')}</p> : null}
      <h1 className="text-xl font-bold text-ink">{t('find.title')}</h1>
      <p className="mb-4 mt-1 text-sm text-ink-muted">{t('find.subtitle')}</p>

      {!found ? (
        <form onSubmit={search} noValidate>
          <label htmlFor="lw-owner" className="mb-1 block text-sm font-medium text-ink-soft">{t('find.ownerId')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <input id="lw-owner" value={raw} autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false}
              onChange={(e) => { setRaw(e.target.value.toUpperCase()); setError(null); }}
              placeholder={t('find.placeholder')} aria-invalid={!!error} aria-describedby="lw-find-error"
              className="w-full rounded-xl border border-line-strong bg-surface py-3 pl-10 pr-3 font-mono text-base uppercase tracking-wide text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div id="lw-find-error"><InlineError message={error} /></div>
          <div className="mt-4 flex gap-2">
            {onCancel ? <Button variant="secondary" onClick={onCancel} className="flex-1">{t('common.cancel')}</Button> : null}
            <Button type="submit" busy={busy} disabled={!raw.trim()} className="flex-1">{t('find.search')}</Button>
          </div>
        </form>
      ) : (
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Building2 className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{t('find.found')} · {found.ownerId}</p>
              <h2 className="truncate text-base font-semibold text-ink">{found.name}</h2>
              {found.address ? <p className="text-sm text-ink-muted">{found.address}</p> : null}
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-subtle">{t('find.ownerPhone')}</dt>
              <dd className="inline-flex items-center gap-1 font-mono text-ink"><Lock className="h-3 w-3 text-ink-subtle" aria-hidden="true" />{found.ownerPhoneMasked}</dd>
            </div>
            {found.managedByAgency ? <div className="flex items-center gap-1.5 text-ink-muted"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t('find.managed')}</div> : null}
          </dl>
          <p className="mt-5 text-sm font-semibold text-ink">{t('find.confirm')}</p>
          <InlineError message={error} />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => { setFound(null); setError(null); }} disabled={connecting} className="flex-1">{t('common.no')}</Button>
            <Button onClick={connect} busy={connecting} disabled={already} className="flex-1">{connecting ? t('find.connecting') : t('common.yes')}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
