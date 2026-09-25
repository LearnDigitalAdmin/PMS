// src/components/marketing/marketingContent.ts
//
// Single source of truth for copy used across the public marketing page
// (Nav, Features, Pricing, FAQ, Contact, Footer). Kept deliberately close to
// what src/components/ui/PricingPage.tsx and whatsapp/src/index.ts actually
// do today, so the public page never promises more than the product ships.
//
// NOTE: the on-page FAQ below is mirrored by hand in the FAQPage JSON-LD
// block in index.html. This is a client-rendered SPA with a single static
// index.html shell (no SSR/build-time generation step), so there is no
// automatic way to keep the two in sync — if you edit the questions or
// answers here, update the matching JSON-LD in index.html too.

export const CONTACT = {
  email: 'info@cogvana.co.ke',
  salesEmail: 'sales@cogvana.co.ke',
  whatsapp: '+254791286165',
  whatsappHref: 'https://wa.me/254791286165',
  website: 'https://cogvana.co.ke/',
  appUrl: 'https://plot.myregister.co.ke/',
};

export const TRIAL_OFFER = 'Get 3 months of Business tier free when you sign up — no card needed';

export interface MarketingTier {
  id: string;
  name: string;
  blurb: string;
  properties: string;
  tenants: string;
  sync: boolean;
  branding: string;
  support: string;
  highlights: string[];
  trialTag?: string;
}

// Mirrors planStructure in src/components/ui/PricingPage.tsx.
// Deliberately omits KES prices: those are loaded live from Firestore at
// runtime (loadFirestorePlans) and are not hardcoded anywhere in the app,
// so a static marketing page has no safe number to show pre-signup.
export const MARKETING_TIERS: MarketingTier[] = [
  {
    id: 'free',
    name: 'Free Forever',
    blurb: 'Try Plot Yangu with a single property, no time limit.',
    properties: '1 property',
    tenants: 'Up to 5 tenants',
    sync: false,
    branding: 'Heavy Plot Yangu branding on invoices',
    support: 'Community',
    highlights: ['Invoice generation', 'Local storage on this device', 'WhatsApp/Email sharing'],
  },
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For a landlord managing a handful of properties.',
    properties: 'Up to 3 properties',
    tenants: 'Up to 30 tenants',
    sync: false,
    branding: 'Light footer branding',
    support: 'Email',
    highlights: ['Invoice generation', 'Basic reports', 'WhatsApp/Email sharing'],
  },
  {
    id: 'solo',
    name: 'Solo Property Enterprise',
    blurb: 'Built for a single-property landlord who wants cloud sync and automated notifications without the multi-property tiers.',
    properties: '1 property',
    tenants: 'Up to 20 tenants',
    sync: true,
    branding: 'Plot Yangu branding',
    support: 'WhatsApp',
    highlights: ['Automated tenant notifications', 'Multi-device cloud sync', 'Invoice generation'],
  },
  {
    id: 'business',
    name: 'Business',
    blurb: 'Custom branding and priority support for a growing portfolio.',
    properties: 'Up to 9 properties',
    tenants: 'Up to 126 tenants',
    sync: true,
    branding: 'Your logo — no Plot Yangu branding',
    support: 'Priority email',
    highlights: ['Custom logo/branding', 'Excel/PDF export', 'Arrears tracking', 'Multi-device cloud sync'],
    trialTag: '3 months free to start',
  },
  {
    id: 'pro',
    name: 'Professional',
    blurb: 'For larger portfolios that need automated notifications and advanced reporting.',
    properties: 'Up to 16 properties',
    tenants: 'Up to 300 tenants',
    sync: true,
    branding: 'Your logo — no Plot Yangu branding',
    support: 'Priority email + priority WhatsApp',
    highlights: ['Automated tenant notifications', 'Advanced reports', 'Excel/PDF export', 'Arrears tracking'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    blurb: 'Unlimited properties and tenants with full white-label invoices.',
    properties: 'Unlimited properties',
    tenants: 'Unlimited tenants',
    sync: true,
    branding: 'Full white-label',
    support: 'Phone + WhatsApp',
    highlights: ['Full white-label invoices', 'Bulk invoice sending', 'Advanced analytics', 'Dedicated support'],
  },
];

export interface HowItWorksStep {
  title: string;
  description: string;
}

export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    title: 'Add a property',
    description: 'Set up each property and its units — everything is saved to this device first, so it works even with no signal.',
  },
  {
    title: 'Add tenants',
    description: 'Attach tenants to a unit, with their phone number for invoicing and notifications.',
  },
  {
    title: 'Generate invoices',
    description: 'Create and send invoices in a few taps, with a downloadable PDF for each one.',
  },
  {
    title: 'Collect payments via M-Pesa',
    description: 'Tenants pay by M-Pesa; payments are reconciled against the right invoice automatically.',
  },
  {
    title: 'Notify tenants automatically',
    description: 'Invoice, payment, and overdue reminders go out by SMS, with WhatsApp used as a backup channel for tenants who\u2019ve opted in.',
  },
];

export interface MarketingFeature {
  title: string;
  description: string;
}

export const FEATURES: MarketingFeature[] = [
  {
    title: 'Offline-first',
    description: 'Properties, tenants, and invoices are stored locally on your device, so you can keep working without an internet connection.',
  },
  {
    title: 'Multi-device cloud sync',
    description: 'On Solo and above, your data syncs across devices, so you and your team see the same numbers everywhere.',
  },
  {
    title: 'Automatic tenant notifications',
    description: 'Invoice, payment, and overdue reminders are sent automatically by SMS, falling back to WhatsApp for tenants who\u2019ve given consent.',
  },
  {
    title: 'M-Pesa payments',
    description: 'Tenants pay by M-Pesa and payments reconcile against invoices automatically.',
  },
  {
    title: 'Invoice generation',
    description: 'Generate and share professional invoices as PDFs in a few taps.',
  },
  {
    title: 'Custom branding',
    description: 'Business tier and up replace Plot Yangu branding with your own logo on invoices.',
  },
  {
    title: 'Arrears tracking',
    description: 'See who\u2019s behind on rent at a glance, tier permitting.',
  },
  {
    title: 'Reports & export',
    description: 'Export your records to Excel or PDF for your own books or your accountant.',
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

// Mirrored by hand in the FAQPage JSON-LD in index.html — see note at top of file.
export const FAQS: FaqItem[] = [
  {
    question: 'What is Plot Yangu?',
    answer: 'Plot Yangu is a property management app for landlords and property agents. It keeps properties, tenants, invoices, and payments in one dashboard, and works offline-first with local storage on your device.',
  },
  {
    question: 'Who\u2019s behind Plot Yangu?',
    answer: 'Plot Yangu is built and operated by Cogvana Technologies (operated by SMB Kenya Ltd). Cogvana also builds other Kenyan software products, including the school-management app MyRegister. Note: "Cogvana" is also the name of a separate education app that Cogvana Technologies publishes \u2014 that app is a different product from Plot Yangu.',
  },
  {
    question: 'Does Plot Yangu work offline?',
    answer: 'Yes. Properties, tenants, and invoices are stored locally on your device first, so you can keep working without a connection. On Solo tier and above, your data also syncs to the cloud across your devices whenever you\u2019re back online.',
  },
  {
    question: 'What does the free trial actually include?',
    answer: 'New accounts get 3 months of Business tier free, with no card required to sign up \u2014 that includes multi-device cloud sync, your own logo on invoices, arrears tracking, and Excel/PDF export for the length of the trial.',
  },
  {
    question: 'How does billing and payment work?',
    answer: 'Subscriptions and SMS credit top-ups are paid by M-Pesa, processed through Paystack. You\u2019ll get an M-Pesa prompt on your phone to enter your PIN and confirm.',
  },
  {
    question: 'Does Plot Yangu notify my tenants automatically?',
    answer: 'Yes \u2014 new invoices, payment confirmations, and overdue reminders are sent automatically, by SMS first and WhatsApp as a fallback for tenants who\u2019ve opted in to WhatsApp messages.',
  },
  {
    question: 'Is Plot Yangu available on mobile and desktop?',
    answer: 'Yes. Plot Yangu runs in the browser, as an Android app, and as a desktop app, in addition to the web dashboard.',
  },
];
