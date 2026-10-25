import { Languages } from 'lucide-react';
import { useWatch } from '../useWatch.tsx';

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useWatch();
  return (
    <div role="group" aria-label={t('set.language')} className={`inline-flex items-center gap-1 rounded-full border border-line bg-surface p-0.5 text-xs font-semibold ${className}`}>
      <Languages className="ml-2 h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
      {(['en', 'sw'] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} lang={l}
          className={`min-h-8 rounded-full px-3 ${lang === l ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-surface-sunken'}`}>
          {l === 'en' ? 'English' : 'Kiswahili'}
        </button>
      ))}
    </div>
  );
}
