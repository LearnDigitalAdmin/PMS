// src/components/marketing/MarketingFooter.tsx
import React from 'react';
import { CONTACT } from './marketingContent';

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact' },
];

const MarketingFooter: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <img
              src="/icons/apple-icon-180.png"
              alt="Plot Yangu logo"
              className="w-7 h-7 rounded-lg"
            />
            <span className="text-white font-bold">Plot Yangu</span>
          </div>
          <p className="text-blue-100/60 text-sm">
            A product of{' '}
            <a href={CONTACT.website} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              Cogvana Technologies
            </a>{' '}
            (operated by SMB Kenya Ltd).
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-blue-100/70 hover:text-white text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <p className="text-blue-100/50 text-xs">&copy; {year} Cogvana Technologies. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default MarketingFooter;
