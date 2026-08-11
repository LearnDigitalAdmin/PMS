import React from 'react';
import { Building, FileText, DollarSign, MessageSquare, ArrowDown, CheckCircle2 } from 'lucide-react';

interface HeroSectionProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

const features = [
  { icon: Building, text: 'Track every property and unit in one place' },
  { icon: FileText, text: 'Generate invoices and receipts instantly' },
  { icon: DollarSign, text: 'Collect and reconcile payments automatically' },
  { icon: MessageSquare, text: 'Reach tenants by SMS, right from the app' },
];

const HeroSection: React.FC<HeroSectionProps> = ({ onGetStarted, onSignIn }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-lg rounded-2xl mb-6">
        <Building className="w-8 h-8 text-white" />
      </div>

      <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 max-w-2xl leading-tight">
        Property management, without the paperwork
      </h1>
      <p className="text-blue-100 text-lg max-w-xl mb-8">
        Plot Yangu keeps your properties, tenants, invoices, and payments in
        one simple dashboard — built for landlords and agents.
      </p>

      <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-lg border border-white/25 rounded-full px-5 py-2 mb-10">
        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
        <span className="text-white text-sm font-medium">
          Get 3 months of Business tier free when you sign up — no card needed
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-14">
        <button
          onClick={onGetStarted}
          className="px-8 py-3 bg-white text-indigo-700 font-semibold rounded-xl shadow-lg hover:bg-blue-50 transition-colors duration-200"
        >
          Get Started Free
        </button>
        <button
          onClick={onSignIn}
          className="px-8 py-3 bg-white/10 backdrop-blur-lg border border-white/30 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors duration-200"
        >
          I already have an account
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl w-full mb-10">
        {features.map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex flex-col items-center text-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-blue-100 text-xs sm:text-sm">{text}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onGetStarted}
        aria-label="Scroll to sign up"
        className="animate-bounce text-white/70 hover:text-white transition-colors"
      >
        <ArrowDown className="w-6 h-6" />
      </button>
    </div>
  );
};

export default HeroSection;