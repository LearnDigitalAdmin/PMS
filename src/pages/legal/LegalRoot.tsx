// src/pages/legal/LegalRoot.tsx
//
// Entry for the public legal pages (/terms and /privacy). main.tsx renders this INSTEAD of <App />
// for those two paths, so the pages work for signed-out visitors, tenants and regulators, and never
// start the app's database, sign-in or sync.
import React from 'react';
import LegalLayout from './LegalLayout';
import { termsDocument } from './termsContent';
import { privacyDocument } from './privacyContent';
import { legalKeyForPath } from './legalConfig';

const LegalRoot: React.FC = () => {
  const key = legalKeyForPath(window.location.pathname) ?? 'terms';
  return key === 'privacy'
    ? <LegalLayout docKey="privacy" doc={privacyDocument} />
    : <LegalLayout docKey="terms" doc={termsDocument} />;
};

export default LegalRoot;
