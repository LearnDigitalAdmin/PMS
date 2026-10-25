import { useState } from 'react';
import { Building2, LogOut, Plus, Trash2 } from 'lucide-react';
import { Button, Card, ErrorBox, SectionTitle, Sheet } from '../components/ui.tsx';
import { LangToggle } from '../components/LangToggle.tsx';
import { UnlockBanner } from '../components/UnlockBanner.tsx';
import type { SnapshotState } from '../useSnapshot.ts';
import { useErrorText, useWatch } from '../useWatch.tsx';
import { dateTimeLabel, formatCountdown } from '../format.ts';
import type { Connection } from '../types.ts';

export default function Settings({ data, onAdd }: { data: SnapshotState; onAdd: () => void }) {
  const { t, lang, connections, activeId, setActiveId, disconnect, signOut, auth } = useWatch();
  const errText = useErrorText();
  const [confirm, setConfirm] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doDisconnect = async () => {
    if (!confirm) return;
    setBusy(true); setError(null);
    try { await disconnect(confirm.ownerId); setConfirm(null); } catch (e) { setError(errText(e, formatCountdown)); } finally { setBusy(false); }
  };
  const mask = data.snapshot?.mask;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ink">{t('set.title')}</h1>

      <Card>
        <SectionTitle>{t('set.language')}</SectionTitle>
        <LangToggle />
      </Card>

      <Card>
        <SectionTitle hint={t('set.limit')}>{t('set.properties')}</SectionTitle>
        <ul className="divide-y divide-line-soft">
          {connections.map((c) => (
            <li key={c.ownerId} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Building2 className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{c.propertyName}</p>
                  <p className="truncate text-xs text-ink-subtle">{c.ownerId}{c.address ? ` · ${c.address}` : ''}</p>
                  {c.ownerId === activeId ? <p className="text-xs font-semibold text-brand-700">{t('set.active')}</p> : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {c.ownerId !== activeId ? <Button variant="ghost" onClick={() => setActiveId(c.ownerId)} className="px-3">{t('set.view')}</Button> : null}
                <Button variant="ghost" onClick={() => setConfirm(c)} ariaLabel={`${t('set.disconnect')} ${c.propertyName}`} className="px-3 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={onAdd} className="mt-3 w-full"><Plus className="h-4 w-4" aria-hidden="true" />{t('shell.addProperty')}</Button>
      </Card>

      {mask ? (
        <Card>
          <SectionTitle>{t('set.unlockStatus')}</SectionTitle>
          <p className="mb-3 text-sm text-ink-muted">
            {mask.level === 'open' ? (mask.reason === 'otp' ? t('mask.reason.otp', { time: dateTimeLabel(mask.unlockedUntil, lang) }) : t(`mask.reason.${mask.reason}`)) : t('mask.reason.locked')}
          </p>
          {data.snapshot ? <UnlockBanner mask={mask} ownerId={data.snapshot.ownerId} /> : null}
        </Card>
      ) : null}

      <Card>
        {auth.status === 'signedIn' ? <p className="mb-3 text-sm text-ink-muted">{t('set.signedInAs', { phone: auth.phone })}</p> : null}
        <Button variant="secondary" onClick={() => void signOut()} className="w-full"><LogOut className="h-4 w-4" aria-hidden="true" />{t('set.signOut')}</Button>
      </Card>

      {confirm ? (
        <Sheet title={t('set.disconnectTitle')} onClose={() => setConfirm(null)}>
          <p className="mb-4 text-sm text-ink-muted">{t('set.disconnectBody', { name: confirm.propertyName })}</p>
          {error ? <div className="mb-3"><ErrorBox message={error} /></div> : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy} className="flex-1">{t('common.no')}</Button>
            <Button variant="danger" onClick={doDisconnect} busy={busy} className="flex-1">{t('set.disconnect')}</Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
