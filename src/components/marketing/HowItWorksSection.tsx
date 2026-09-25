// src/components/marketing/HowItWorksSection.tsx
import React from 'react';
import { HOW_IT_WORKS } from './marketingContent';

const HowItWorksSection: React.FC = () => {
  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">How it works</h2>
          <p className="text-blue-100/80 max-w-xl mx-auto">
            From your first property to your first M-Pesa payment, in five steps.
          </p>
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {HOW_IT_WORKS.map((step, i) => (
            <li
              key={step.title}
              className="bg-white/10 backdrop-blur-lg border border-white/15 rounded-2xl p-6 flex flex-col gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white font-bold text-sm">
                {i + 1}
              </div>
              <h3 className="text-white font-semibold">{step.title}</h3>
              <p className="text-blue-100/80 text-sm leading-relaxed">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default HowItWorksSection;
