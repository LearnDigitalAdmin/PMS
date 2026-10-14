// src/pages/legal/legalTypes.ts
//
// Shape of a legal document. The content files (termsContent.ts / privacyContent.ts) are plain
// data in this shape; LegalLayout.tsx renders them. Inline text supports two tiny bits of markup:
//   **bold**            and            [label](https://link  or  mailto:x@y  or  /terms)

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'note'; tone: 'info' | 'warn' | 'good'; title?: string; text: string }
  | { type: 'table'; head: string[]; rows: string[][] };

export interface LegalSection {
  /** Anchor id, also used by the table of contents. Keep stable: people link to these. */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  /** One-line description (also used as the page's meta description). */
  description: string;
  /** Short plain-language lead-in shown above the summary. */
  intro: string;
  summaryTitle: string;
  /** "The short version" bullets. Plain language; the numbered sections below are what binds. */
  summary: string[];
  sections: LegalSection[];
}
