// src/components/marketing/ContactSection.tsx
import React from 'react';
import { Mail, MessageCircle, Globe } from 'lucide-react';
import { CONTACT } from './marketingContent';

const ContactSection: React.FC = () => {
  return (
    <section id="contact" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/5">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Talk to us</h2>
        <p className="text-blue-100/80 max-w-xl mx-auto mb-12">
          Questions about a plan, a feature, or getting your properties set up? Reach the Cogvana team directly.
        </p>

        <div className="grid sm:grid-cols-3 gap-6">
          <a
            href={`mailto:${CONTACT.salesEmail}`}
            className="bg-white/10 backdrop-blur-lg border border-white/15 rounded-2xl p-6 hover:bg-white/15 transition-colors flex flex-col items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Email</p>
              <p className="text-blue-100/80 text-sm break-all">{CONTACT.salesEmail}</p>
              <p className="text-blue-100/50 text-xs break-all mt-1">{CONTACT.email}</p>
            </div>
          </a>

          <a
            href={CONTACT.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white/10 backdrop-blur-lg border border-white/15 rounded-2xl p-6 hover:bg-white/15 transition-colors flex flex-col items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">WhatsApp</p>
              <p className="text-blue-100/80 text-sm">{CONTACT.whatsapp}</p>
            </div>
          </a>

          <a
            href={CONTACT.website}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white/10 backdrop-blur-lg border border-white/15 rounded-2xl p-6 hover:bg-white/15 transition-colors flex flex-col items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Website</p>
              <p className="text-blue-100/80 text-sm">cogvana.co.ke</p>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
