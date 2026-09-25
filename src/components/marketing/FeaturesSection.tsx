// src/components/marketing/FeaturesSection.tsx
import React from 'react';
import {
  WifiOff,
  RefreshCw,
  MessageSquare,
  Smartphone,
  FileText,
  Palette,
  AlertTriangle,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react';
import { FEATURES } from './marketingContent';

const ICONS: LucideIcon[] = [
  WifiOff,
  RefreshCw,
  MessageSquare,
  Smartphone,
  FileText,
  Palette,
  AlertTriangle,
  FileSpreadsheet,
];

const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Everything a landlord needs</h2>
          <p className="text-blue-100/80 max-w-xl mx-auto">
            Built for the way property management actually works in Kenya — offline-friendly, M-Pesa native.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div
                key={feature.title}
                className="bg-white/10 backdrop-blur-lg border border-white/15 rounded-2xl p-6"
              >
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
                <p className="text-blue-100/80 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
