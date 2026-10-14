// src/pages/legal/LegalLayout.tsx
//
// Renders a LegalDocument (see legalTypes.ts) as a standalone public page: sticky table of contents,
// plain-language summary, numbered sections, print-friendly, light/dark aware. It does not touch the
// app's auth, database or sync, so it loads instantly for signed-out visitors, tenants and regulators.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer, Mail, MessageCircle, Info, AlertTriangle, CheckCircle2, ListTree } from 'lucide-react';
import { COMPANY, LEGAL_EFFECTIVE, LEGAL_PATHS, LEGAL_UPDATED, LEGAL_VERSION, type LegalDocKey } from './legalConfig';
import type { LegalBlock, LegalDocument } from './legalTypes';

// ---- tiny inline markup: **bold** and [label](href) -----------------------------------------------------
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_HREF = /^(https:\/\/|mailto:|tel:|\/|#)/;

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] !== undefined) {
      out.push(<strong key={key++} className="font-semibold text-ink">{m[1]}</strong>);
    } else if (m[2] !== undefined && m[3] !== undefined && SAFE_HREF.test(m[3])) {
      const external = m[3].startsWith('https://');
      out.push(
        <a
          key={key++}
          href={m[3]}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
        >
          {m[2]}
        </a>,
      );
    } else {
      out.push(m[0]);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const NOTE_STYLE = {
  info: { box: 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-300', Icon: Info },
  warn: { box: 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-300', Icon: AlertTriangle },
  good: { box: 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-300', Icon: CheckCircle2 },
} as const;

const Block: React.FC<{ block: LegalBlock }> = ({ block }) => {
  switch (block.type) {
    case 'p':
      return <p className="leading-7 text-ink-soft">{renderInline(block.text)}</p>;
    case 'ul':
      return (
        <ul className="list-disc space-y-2 pl-6 leading-7 text-ink-soft marker:text-ink-faint">
          {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal space-y-2 pl-6 leading-7 text-ink-soft marker:text-ink-faint">
          {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ol>
      );
    case 'note': {
      const s = NOTE_STYLE[block.tone];
      return (
        <div className={`flex gap-3 rounded-xl border p-4 ${s.box}`} role="note">
          <s.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.icon}`} aria-hidden="true" />
          <div className="min-w-0 text-sm leading-6 text-ink-soft">
            {block.title && <p className="mb-1 font-semibold text-ink">{block.title}</p>}
            <p>{renderInline(block.text)}</p>
          </div>
        </div>
      );
    }
    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-surface-sunken text-ink">
              <tr>{block.head.map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line text-ink-soft">
              {block.rows.map((row, r) => (
                <tr key={r} className="align-top">
                  {row.map((cell, c) => (
                    <td key={c} className={`px-4 py-2.5 leading-6 ${c === 0 ? 'font-medium text-ink' : ''}`}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
};

// ---- theme: same rule App.tsx uses (saved choice, else the OS) -----------------------------------------
function useAppTheme() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('darkMode');
      const dark = saved === 'true' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    } catch {
      /* storage blocked: the OS preference still applies through the CSS tokens */
    }
  }, []);
}

// ---- document meta -------------------------------------------------------------------------------------
function useDocumentMeta(title: string, description: string, path: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | ${COMPANY.product} by ${COMPANY.shortName}`;

    const setMeta = (selector: string, create: () => HTMLElement, attr: string, value: string) => {
      let el = document.head.querySelector<HTMLElement>(selector);
      if (!el) { el = create(); document.head.appendChild(el); }
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, value);
      return () => { if (prev === null) el?.remove(); else el?.setAttribute(attr, prev); };
    };
    const undoDescription = setMeta('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), 'content', description);
    const undoCanonical = setMeta('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', `${COMPANY.appUrl}${path}`);

    return () => { document.title = previousTitle; undoDescription(); undoCanonical(); };
  }, [title, description, path]);
}

interface LegalLayoutProps {
  docKey: LegalDocKey;
  doc: LegalDocument;
}

const OTHER: Record<LegalDocKey, { key: LegalDocKey; label: string }> = {
  terms: { key: 'privacy', label: 'Privacy Policy' },
  privacy: { key: 'terms', label: 'Terms of Service' },
};

const LegalLayout: React.FC<LegalLayoutProps> = ({ docKey, doc }) => {
  useAppTheme();
  useDocumentMeta(doc.title, doc.description, LEGAL_PATHS[docKey]);

  const sections = useMemo(() => doc.sections.map((s, i) => ({ ...s, n: i + 1 })), [doc.sections]);
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const other = OTHER[docKey];

  // Browsers cannot jump to #hash on a page that rendered after load, so do it here.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace('#', ''));
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView(), 50);
    return () => window.clearTimeout(t);
  }, []);

  // Highlight the section being read.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    sections.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [sections]);

  const goBack = () => {
    if (window.history.length > 1 && document.referrer) window.history.back();
    else window.location.assign('/');
  };

  const year = new Date().getFullYear();

  return (
    <div className="app-canvas min-h-screen text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-xl print:hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${COMPANY.product} home`}>
            <img src="/icons/apple-icon-180.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-base font-bold text-ink">{COMPANY.product}</span>
              <span className="text-[11px] text-ink-subtle">by {COMPANY.shortName}</span>
            </span>
          </a>
          <nav aria-label="Legal documents" className="flex items-center gap-1.5 text-sm">
            <a href={LEGAL_PATHS.terms} aria-current={docKey === 'terms' ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium ${docKey === 'terms' ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-surface-sunken'}`}>Terms</a>
            <a href={LEGAL_PATHS.privacy} aria-current={docKey === 'privacy' ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium ${docKey === 'privacy' ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-surface-sunken'}`}>Privacy</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:pt-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button onClick={goBack} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-sunken">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-sunken">
            <Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF
          </button>
        </div>

        {/* Title block */}
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">{COMPANY.product} · {COMPANY.legalName}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-ink-muted">{doc.intro}</p>
          <dl className="mt-5 grid gap-x-8 gap-y-1 text-sm text-ink-subtle sm:grid-cols-3">
            <div><dt className="inline font-medium text-ink-soft">Version </dt><dd className="inline">{LEGAL_VERSION}</dd></div>
            <div><dt className="inline font-medium text-ink-soft">Effective </dt><dd className="inline">{LEGAL_EFFECTIVE}</dd></div>
            <div><dt className="inline font-medium text-ink-soft">Last updated </dt><dd className="inline">{LEGAL_UPDATED}</dd></div>
          </dl>
        </div>

        {/* Summary */}
        <section aria-labelledby="summary-title" className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-500/30 dark:bg-blue-500/10 sm:p-8">
          <h2 id="summary-title" className="text-lg font-bold text-ink">{doc.summaryTitle}</h2>
          <ul className="mt-3 space-y-2.5">
            {doc.summary.map((point, i) => (
              <li key={i} className="flex gap-3 leading-7 text-ink-soft">
                <CheckCircle2 className="mt-1.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                <span>{renderInline(point)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-5 text-ink-subtle">The summary is a convenience. The numbered sections below are the full and binding text.</p>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {/* Table of contents */}
          <aside className="print:hidden">
            <details className="rounded-2xl border border-line bg-surface p-4 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink">
                <ListTree className="h-4 w-4" aria-hidden="true" /> On this page
              </summary>
              <ol className="mt-3 space-y-1 text-sm">
                {sections.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-ink-soft hover:bg-surface-sunken">{s.n}. {s.title}</a></li>
                ))}
              </ol>
            </details>
            <nav aria-label="Table of contents" className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-4 lg:block">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle"><ListTree className="h-4 w-4" aria-hidden="true" /> On this page</p>
              <ol className="space-y-0.5 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} aria-current={active === s.id ? 'location' : undefined}
                      className={`block rounded-md px-2 py-1.5 leading-5 ${active === s.id ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'}`}>
                      {s.n}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          {/* Sections */}
          <article className="min-w-0 space-y-10">
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24">
                <h2 id={`${s.id}-h`} className="text-xl font-bold text-ink sm:text-2xl">
                  <span className="mr-2 text-ink-faint">{s.n}.</span>{s.title}
                </h2>
                <div className="mt-4 space-y-4">
                  {s.blocks.map((b, i) => <Block key={i} block={b} />)}
                </div>
              </section>
            ))}

            {/* Contact + cross link */}
            <section className="rounded-2xl border border-line bg-surface p-6 print:break-inside-avoid">
              <h2 className="text-lg font-bold text-ink">Questions about this {doc.title.toLowerCase()}?</h2>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                {COMPANY.legalName}{COMPANY.registrationNumber ? ` (reg. no. ${COMPANY.registrationNumber})` : ''}, {COMPANY.location}.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <a href={`mailto:${COMPANY.email}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-ink-soft hover:bg-surface-sunken"><Mail className="h-4 w-4" aria-hidden="true" /> {COMPANY.email}</a>
                <a href={COMPANY.whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-ink-soft hover:bg-surface-sunken"><MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp {COMPANY.whatsapp}</a>
                <a href={LEGAL_PATHS[other.key]} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700">Read the {other.label}</a>
              </div>
            </section>
          </article>
        </div>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-subtle print:hidden" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
        &copy; {year} {COMPANY.legalName}. {COMPANY.product} is a product of <a href={COMPANY.website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{COMPANY.shortName}</a>.
      </footer>
    </div>
  );
};

export default LegalLayout;
