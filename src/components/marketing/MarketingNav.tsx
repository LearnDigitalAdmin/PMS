// src/components/marketing/MarketingNav.tsx
import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

interface MarketingNavProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact' },
];

const MarketingNav: React.FC<MarketingNavProps> = ({ onGetStarted, onSignIn }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-indigo-950/60 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <img
              src="/icons/apple-icon-180.png"
              alt="Plot Yangu logo"
              className="w-8 h-8 rounded-lg"
            />
            <div className="flex flex-col leading-none">
              <span className="text-white font-bold text-lg">Plot Yangu</span>
              <span className="text-blue-200/70 text-[11px]">by Cogvana</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-blue-100 hover:text-white text-sm font-medium transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-semibold text-white hover:text-blue-200 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={onGetStarted}
              className="px-4 py-2 bg-white text-indigo-700 text-sm font-semibold rounded-lg shadow hover:bg-blue-50 transition-colors"
            >
              Get Started
            </button>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            className="md:hidden text-white p-2 -mr-2"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden pb-4 flex flex-col gap-1">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-blue-100 hover:text-white text-sm font-medium py-2 px-2 rounded-lg hover:bg-white/5"
              >
                {link.label}
              </a>
            ))}
            <div className="flex gap-2 mt-2 px-2">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onSignIn();
                }}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-white/10 rounded-lg"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onGetStarted();
                }}
                className="flex-1 px-4 py-2 bg-white text-indigo-700 text-sm font-semibold rounded-lg"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default MarketingNav;
