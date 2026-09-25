// src/components/marketing/PricingSection.tsx
import React from 'react';
import { Check, Cloud, CloudOff } from 'lucide-react';
import { MARKETING_TIERS, TRIAL_OFFER } from './marketingContent';

interface PricingSectionProps {
  onGetStarted: () => void;
}

const PricingSection: React.FC<PricingSectionProps> = ({ onGetStarted }) => {
  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-4">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Plans for every portfolio</h2>
          <p className="text-blue-100/80 max-w-xl mx-auto">
            From a single rental to a full portfolio. Exact KES pricing is shown in-app during
            sign-up, since it can vary — no card is needed to see it or to start your trial.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-12">
          <span className="inline-flex items-center gap-2 bg-emerald-400/15 border border-emerald-300/30 rounded-full px-4 py-1.5 text-emerald-200 text-sm font-medium">
            <Check className="w-4 h-4" />
            {TRIAL_OFFER}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MARKETING_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative flex flex-col bg-white/10 backdrop-blur-lg border rounded-2xl p-6 ${
                tier.trialTag ? 'border-emerald-300/50 ring-1 ring-emerald-300/30' : 'border-white/15'
              }`}
            >
              {tier.trialTag && (
                <span className="absolute -top-3 left-6 bg-emerald-400 text-emerald-950 text-xs font-bold px-3 py-1 rounded-full">
                  {tier.trialTag}
                </span>
              )}
              <h3 className="text-white text-xl font-bold mb-1">{tier.name}</h3>
              <p className="text-blue-100/70 text-sm mb-4">{tier.blurb}</p>

              <div className="flex items-center gap-1.5 text-blue-100/90 text-sm mb-1">
                {tier.sync ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
                <span>{tier.sync ? 'Multi-device cloud sync' : 'Local storage only'}</span>
              </div>
              <p className="text-blue-100/90 text-sm mb-1">{tier.properties}</p>
              <p className="text-blue-100/90 text-sm mb-4">{tier.tenants}</p>

              <ul className="flex-1 space-y-2 mb-6">
                {tier.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-blue-100/80 text-sm">
                    <Check className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2 text-blue-100/60 text-xs pt-1 border-t border-white/10 mt-3">
                  <span>Branding: {tier.branding} · Support: {tier.support}</span>
                </li>
              </ul>

              <button
                onClick={onGetStarted}
                className="mt-auto w-full px-4 py-2.5 bg-white/15 hover:bg-white/25 border border-white/25 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Get Started
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-blue-100/50 text-xs mt-8 max-w-2xl mx-auto">
          Limits and features shown reflect Plot Yangu's published plan structure and may change.
          Subscriptions and SMS credit top-ups are paid by M-Pesa via Paystack.
        </p>
      </div>
    </section>
  );
};

export default PricingSection;
