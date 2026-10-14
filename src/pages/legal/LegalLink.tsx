// src/pages/legal/LegalLink.tsx
//
// Link to the Terms / Privacy Policy from anywhere in the app.
//  - Web / PWA: opens the page in a NEW tab, so someone halfway through sign-up never loses the form.
//  - Android / iOS / desktop shell: opens the hosted page in the system browser (the legal pages are
//    public web pages, they are not part of the offline app shell).
import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { COMPANY, LEGAL_PATHS, type LegalDocKey } from './legalConfig';

interface LegalLinkProps {
  to: LegalDocKey;
  className?: string;
  children?: React.ReactNode;
}

const LABELS: Record<LegalDocKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const LegalLink: React.FC<LegalLinkProps> = ({ to, className, children }) => {
  const path = LEGAL_PATHS[to];
  const hosted = `${COMPANY.appUrl}${path}`;

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!Capacitor.isNativePlatform()) return; // plain anchor, new tab
    e.preventDefault();
    void Browser.open({ url: hosted }).catch(() => {
      window.open(hosted, '_blank', 'noopener,noreferrer');
    });
  };

  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={className ?? 'underline underline-offset-2 hover:opacity-80'}
    >
      {children ?? LABELS[to]}
    </a>
  );
};

export default LegalLink;
