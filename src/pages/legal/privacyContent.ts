// src/pages/legal/privacyContent.ts
//
// Privacy Policy for Plot Yangu. Plain data (see legalTypes.ts); rendered by LegalLayout.
// Written from what this repo (PMS), PAY and CYBER (Samuhia Desk) actually collect and do.
// Section ids are anchors people link to: keep them stable.
import { COMPANY, POLICY } from './legalConfig';
import type { LegalDocument } from './legalTypes';

export const privacyDocument: LegalDocument = {
  title: 'Privacy Policy',
  description: `How ${COMPANY.legalName} collects, uses, stores and protects personal data in ${COMPANY.product}: what we hold, who handles it, how long we keep it and the rights you have under Kenya's Data Protection Act, 2019.`,
  intro: `This policy explains what personal data ${COMPANY.product} handles, why, where it is kept, who can see it and what rights you have. It is written for landlords and agents who use the app, for tenants whose details a landlord has entered, and for desk agents.`,
  summaryTitle: 'The short version',
  summary: [
    `**We never sell your data and we never share it for advertising or marketing.** There are no advertising networks, data brokers or analytics trackers in ${COMPANY.product}.`,
    `**Your data is used by our own systems to deliver the service**: to keep your records, send the messages you ask for, take payments and support you.`,
    `**A few infrastructure providers carry data for us, because the service cannot work without them**: Google (cloud hosting), Paystack and M-Pesa (payments), our SMS gateway, and Meta's WhatsApp platform. They act on our instructions and only receive what their part of the job needs. They are listed in full [below](#providers).`,
    `**Landlords are in charge of their tenants' details.** When a landlord enters a tenant into ${COMPANY.product}, the landlord decides why; we process it for them. Tenants can ask us or their landlord about their data.`,
    `**Your records live on your device first.** Cloud copies exist only on trial and paid plans with Cloud Sync.`,
    `**You have rights** to see, correct, delete and move your data, and to complain to the Data Protection Commissioner. Write to **${COMPANY.email}**.`,
  ],
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are and our role',
      blocks: [
        { type: 'p', text: `${COMPANY.product} is operated by **${COMPANY.legalName}**, registered in ${COMPANY.country} and operating from ${COMPANY.location} ("**${COMPANY.shortName}**", "**we**", "**us**").${COMPANY.odpcRegistrationNumber ? ` We are registered with the Office of the Data Protection Commissioner (registration no. ${COMPANY.odpcRegistrationNumber}).` : ''} We handle personal data in line with the **Data Protection Act, 2019** and its regulations.` },
        {
          type: 'table',
          head: ['Data', 'Our role', 'Who decides why it is used'],
          rows: [
            ['Account Data: you (the landlord, agent or company) and your business details', '**Data controller**', 'Samuhia'],
            ['Tenant and property records you enter: tenant names, phones, emails, rent, deposits, leases, invoices, payments', '**Data processor** for you', 'You (the landlord or agent)'],
            ['Messaging consent records (who allowed or stopped WhatsApp messages), payment and security records, desk audit trail', '**Data controller**', 'Samuhia'],
          ],
        },
        { type: 'p', text: `Where this policy says "**you**" it means whoever the sentence is about: an account holder, a tenant, or a desk agent. The [Terms of Service](/terms) apply alongside this policy.` },
      ],
    },
    {
      id: 'what-we-collect',
      title: 'What we collect',
      blocks: [
        {
          type: 'table',
          head: ['Who it is about', 'What we hold'],
          rows: [
            ['Account holders (landlords, agents, companies)', `Full name, email address, mobile number, **National ID number**, password (stored only as a salted one-way hash, never as readable text), optional company name, address, phone and email; plan, trial and subscription dates; SMS Credit balance; your Landlord code (PYL-…) and the desks you have connected; when you last synchronised.`],
            ['Properties and units', 'Property names, addresses, descriptions and photos, units and their rent, your agent commission rate, billing mode, and restricted flags.'],
            ['Tenants (entered by a landlord)', 'Name, phone number, email, unit, rent, service charges and standing fees, deposit, lease start and end dates, active or restricted status.'],
            ['Invoices and payments', 'Billing month, rent, water and power meter readings and prices, other charges, totals, amounts paid, arrears, due and paid dates, payment method and notes, and the invoice PDF (which carries your business details, the tenant\'s details and your payment instructions).'],
            ['Tenant payment-behaviour summaries', 'Where Cloud Sync is on: a per-tenant summary worked out from payment history (on-time rate, arrears, months tracked, a score, a risk level, warning flags and a suggested action). See [automated processing](#automated).'],
            ['Landlord reports and finances', 'Monthly landlord statements, commission summaries, business expenses and income records, which you create in the app.'],
            ['Messages', 'The tenant\'s name and number and the text of the message, while it is being sent; and, for our records, counts of recipients, credits used and successes and failures (not the text or numbers). Delivery providers keep their own records.'],
            ['WhatsApp consent register', 'A tenant\'s phone number and name, the landlord/agent and property that asked, whether they chose **allow** or **stop**, and when.'],
            ['Payments we process', `The M-Pesa number used, amount, reference, status and time of subscription, SMS Credit and rent payments, and, for rent collection, your settlement account details (M-Pesa number, bank, paybill or till). We never see or keep an M-Pesa PIN or a card number.`],
            ['Desk activity', 'Desk requests you send (category, subject, message, your name, phone, Landlord code), replies, and an audit trail of actions a desk takes for you.'],
            ['Technical data', 'Device and app information needed to run the service, and technical logs of our cloud systems, which can include phone numbers, names and reference numbers for fixing problems.'],
          ],
        },
        { type: 'note', tone: 'info', title: 'About National ID numbers', text: `We ask account holders for a National ID number to identify the person behind an account. It is also used as the account's reference inside our systems, so it can appear in internal references, such as a payment reference sent to our payment provider and in the storage address of your invoice PDFs. We do not show it to tenants as a field, do not use it for marketing and do not sell it. We do not ask tenants for National ID numbers.` },
        { type: 'p', text: `We do not knowingly collect special categories of data (such as health, religion or biometrics). Please do not enter them into free-text fields such as notes.` },
      ],
    },
    {
      id: 'sources',
      title: 'Where the data comes from',
      blocks: [
        { type: 'ul', items: [
          '**From you**: when you sign up, set up your business, enter properties and tenants, create invoices, send messages or contact us.',
          '**From your tenants**: when they pay through the app, or choose **allow** or **stop** for WhatsApp messages.',
          '**From payment confirmations** from Paystack and M-Pesa about payments you or your tenants make.',
          '**From desks** you connect, when they import tenants or send requests for you.',
          '**From your device and our systems**, such as sign-in status and sync times.',
        ] },
      ],
    },
    {
      id: 'uses',
      title: 'How we use data, and why we are allowed to',
      blocks: [
        { type: 'p', text: `We use data **only** to run ${COMPANY.product}. The Data Protection Act requires a lawful basis for each use:` },
        {
          type: 'table',
          head: ['What we do', 'Lawful basis'],
          rows: [
            ['Create and run your account; sign you in; keep your records; synchronise devices', 'To perform our contract with you'],
            ['Generate invoices and reports; send the messages, invoice links and reminders you ask for or switch on', 'To perform our contract with you (and, for tenants, your landlord\'s lawful basis, such as the tenancy)'],
            ['Take and settle payments, apply plans and credits, pay desk commission, keep payment records', 'Contract; legal obligation (tax and accounting records)'],
            ['Let desks you connect help you, and log what they do', 'Contract; your instruction when you connect a desk'],
            ['WhatsApp messages to tenants who allowed them', 'Consent of the tenant, which can be withdrawn at any time'],
            ['Protect accounts and money: detect fraud and misuse, rate-limit, investigate problems, keep security logs', 'Our legitimate interest in security and preventing fraud; legal obligation'],
            ['Answer your questions and requests; send service and billing notices, security alerts and notice of changes to our terms', 'Contract; legitimate interest'],
            ['Comply with law, court orders and regulator requests', 'Legal obligation'],
          ],
        },
        { type: 'p', text: `We do **not** use your data for advertising, to build marketing profiles, or to decide anything about you automatically with legal effect.` },
      ],
    },
    {
      id: 'no-sale',
      title: 'We never sell or share your data',
      blocks: [
        { type: 'note', tone: 'good', title: 'Our promise', text: `We do **not sell, rent or trade** personal data. We do **not share** it with advertisers, data brokers, marketing companies or anyone else for their own purposes. ${COMPANY.product} contains no advertising or third-party analytics trackers.` },
        { type: 'p', text: `Your data is used by our own systems to deliver the service. To run those systems, a small number of providers must handle some data on our behalf: a mobile network cannot deliver an SMS without the phone number, and a payment cannot be taken without the amount. These providers are **processors**: they act on our instructions, under agreements that require them to protect the data and use it only for that job. We also disclose data where the law requires it, for example to a court, the police or a regulator acting under a valid legal order, and we will only give what is legally required. If ${COMPANY.shortName} is ever sold or merged, personal data would go to the new owner only under this same policy, and we would tell you first.` },
      ],
    },
    {
      id: 'providers',
      title: 'The providers that carry data for us',
      blocks: [
        {
          type: 'table',
          head: ['Provider', 'What it does for us', 'What it receives'],
          rows: [
            ['**Google** (Firebase and Google Cloud)', 'Hosting, sign-in (Firebase Authentication), our database (Firestore), file storage (invoice PDFs) and the cloud functions that run the service', 'Everything stored in the cloud: Account Data and, on Cloud Sync plans, your synchronised records and PDFs'],
            ['**Paystack** and **Safaricom M-Pesa**', 'Take and settle payments: subscriptions, SMS Credits and rent', 'Payer name or reference, M-Pesa number, amount, payment reference and, for rent collection, settlement account details and the split'],
            ['**HostPinnacle** (SMS gateway)', 'Deliver SMS messages to tenants in Kenya', 'The recipient\'s phone number and the message text, and our sender name'],
            ['**Meta** (WhatsApp Business Platform)', 'Deliver backup WhatsApp messages and consent requests to tenants who allowed them', 'The recipient\'s phone number and the message template contents'],
            ['**Google Play** and **RevenueCat** (Android app purchases only)', 'Process subscriptions bought inside the Android app', 'Purchase and entitlement details; they tell us which plan is active'],
          ],
        },
        { type: 'p', text: `These providers have their own privacy policies for data they handle as independent services (for example Safaricom for M-Pesa and Meta for WhatsApp). We do not add other providers without updating this policy.` },
      ],
    },
    {
      id: 'desks',
      title: 'Desks and support agents',
      blocks: [
        { type: 'p', text: `A **desk** is a Samuhia Desk agent that Samuhia has reviewed and activated. The **Top Desk (COG-0000)** is Samuhia's own and is always connected to every account. You can connect up to five more desks and remove them at any time in Settings.` },
        { type: 'p', text: `A connected desk can, through our secure connection: see your account summary and credit balance; import new tenants; list your tenants with phone numbers partly hidden and the amount each owes; export your tenant list (a file with names, full phone numbers, emails, units, rent, deposits and lease dates, available through a link that expires after an hour); and send or schedule SMS to your tenants using your credits. It cannot see your password, sign in as you, or edit or delete your existing records. Tenants and properties you mark as restricted are left out. Every action is written to an audit trail. Desk agents can see requests you send them and any details you put in them.` },
        { type: 'p', text: `Desks and agents may earn a commission share of payments you make, as described in the [Terms](/terms#billing). The commission does not change what you pay and does not involve sharing your data with anyone else.` },
      ],
    },
    {
      id: 'messaging',
      title: 'SMS and WhatsApp',
      blocks: [
        { type: 'p', text: `When you or an automatic notification sends a message, our system composes it from the tenant's name, the message text and your signature (company or name, and your phone number), and passes it with the tenant's number to the SMS gateway (or, as a backup, to WhatsApp for tenants who allowed it). We keep, for our records, only counts (recipients, credits used, successes, failures). Message text and numbers can also appear in technical logs of our cloud systems and in the records of the delivery providers.` },
        { type: 'p', text: `Automatic messages can include a short link (${COMPANY.appUrl}/i/...) to an invoice PDF. **Anyone who has the link can open that invoice**, which contains the tenant's and your business details. Link visits are counted. The link only identifies the invoice; it does not reveal the account holder's identity.` },
        { type: 'p', text: `For WhatsApp we send a consent request first. A tenant's choice of **allow** or **stop** is saved in a register keyed by their phone number, with their name and the landlord/agent and property that asked. We check this register before every WhatsApp message.` },
      ],
    },
    {
      id: 'tenants',
      title: 'If you are a tenant',
      blocks: [
        { type: 'p', text: `Your landlord or agent put your details into ${COMPANY.product} to manage your tenancy: send invoices and reminders, record payments and keep records. **They decide why your data is used, and we process it for them.** The messages you receive come from your landlord or agent through us; the signature at the end shows who. We do not use your details to contact you for our own purposes or for marketing, and we do not sell them.` },
        { type: 'ul', items: [
          '**To see, correct or ask about your data**, ask your landlord or agent first. You can also write to us at ' + COMPANY.email + ' and we will help you reach them or deal with the request ourselves where we hold the data.',
          '**To stop WhatsApp messages**, use the **stop** option in the WhatsApp consent message. For SMS about your tenancy, tell your landlord or agent, whose number is in the message, and they must stop. You can also write to us.',
          '**Payments you make** by M-Pesa through the app are processed by Paystack and M-Pesa as described above.',
        ] },
      ],
    },
    {
      id: 'storage',
      title: 'Where your data lives: your device and our cloud',
      blocks: [
        { type: 'p', text: `**On your device.** ${COMPANY.product} stores your records in a local database on your device (and some settings in your browser or app storage), so it works offline. On the Free plan this is the **only** copy. Anyone who can unlock your device and open the app can see it, so please use a device lock.` },
        { type: 'p', text: `**In the cloud.** On trial and paid plans with Cloud Sync, we upload your properties, units, tenants, invoices, payments, invoice PDFs and tenant payment-behaviour summaries so you can use several devices and so automatic notifications can work. Account Data is always kept in the cloud, because it is how you sign in. When a trial or subscription ends, sync stops, but we do not delete your cloud data at that moment (see [Retention](#retention)).` },
      ],
    },
    {
      id: 'transfers',
      title: 'Sending data outside Kenya',
      blocks: [
        { type: 'p', text: `Our cloud providers run data centres and services outside Kenya. Our cloud functions run in Google Cloud regions in **South Africa, the United States and Europe**, and Google may store and process cloud data in its facilities, which can be outside Kenya. WhatsApp and payment processing may involve systems abroad. Where personal data leaves Kenya, we rely on providers that apply strong security and contractual protections, and we transfer only what the service needs, as the Data Protection Act, 2019 requires. You can ask us for more detail at ${COMPANY.email}.` },
      ],
    },
    {
      id: 'retention',
      title: 'How long we keep data',
      blocks: [
        {
          type: 'table',
          head: ['Data', 'How long'],
          rows: [
            ['Account Data', 'While your account is open, then up to ' + POLICY.deletionDays + ' days after we confirm a closure request, except what we must keep by law'],
            ['Cloud copies of properties, tenants, invoices, payments and PDFs', 'While your account is open; deleted or anonymised within ' + POLICY.deletionDays + ' days of a verified closure request. When a trial or subscription ends we stop syncing but do not delete at once'],
            ['Payment, subscription and commission records', `${POLICY.financialRecordYears} years, for tax, accounting and dispute purposes`],
            ['Desk audit trail and desk requests', 'As long as needed to resolve disputes and prove what was done, and then removed'],
            ['WhatsApp consent register', 'As long as needed to honour a tenant\'s choice (an old "stop" is kept so we do not message them again)'],
            ['SMS send logs (counts only)', 'While your account is open'],
            ['Technical and security logs', 'For a limited period set by our cloud provider and our security needs'],
            ['Data on your own devices', 'Until you delete it or uninstall the app'],
          ],
        },
        { type: 'p', text: `Backups of deleted data may remain for a short period before they are overwritten. If the law or a court requires us to keep something longer, we will.` },
      ],
    },
    {
      id: 'security',
      title: 'How we protect data',
      blocks: [
        { type: 'ul', items: [
          'Data moves between your device and our systems over encrypted connections (HTTPS), and our cloud providers encrypt stored data.',
          'Passwords are stored only as salted one-way hashes. Sign-in goes through Firebase Authentication.',
          'Our cloud functions require you to be signed in, and prices, credits and plans are decided on our servers, not on your device.',
          'Payment notifications are checked for authenticity; payment secrets and SMS gateway credentials are kept in a managed secret store, not in the app.',
          'Desk access is limited to specific actions, hides tenant phone numbers in lists, expires export links after one hour and is logged.',
          'Access to production systems is limited to authorised staff.',
        ] },
        { type: 'p', text: `No system is perfectly secure. You help by using a strong password, locking your device, signing out of shared devices, keeping desk codes private and being careful who opens invoice links. If a breach puts your personal data at risk, we will tell the Data Protection Commissioner and the people affected within the times the law requires, and say what happened and what to do.` },
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      blocks: [
        { type: 'p', text: `Under the Data Protection Act, 2019 you have the right to:` },
        { type: 'ul', items: [
          'be **informed** how your data is used (this policy);',
          '**access** the personal data we hold about you;',
          '**correct** data that is wrong or misleading;',
          '**delete** data that is false or misleading, or that we no longer need;',
          '**object** to, or ask us to **restrict**, certain uses;',
          '**receive** your data in a common format and move it (data portability);',
          '**withdraw consent** where we rely on it (for example WhatsApp), without affecting earlier use; and',
          'not be subject to a decision based **only** on automated processing that has legal or similarly significant effects.',
        ] },
        { type: 'p', text: `**How to use them.** Email ${COMPANY.email} from the address on your account (or, if you are a tenant, from the phone or email we hold for you). We may need to confirm who you are. We aim to answer within **${POLICY.privacyReplyDays} days**. For tenant data held for a landlord, we may direct you to the landlord, or deal with it with their help. Some data we must keep by law, and we will explain if so.` },
        { type: 'p', text: `**Complaints.** If you are not happy, please tell us first. You can also complain to the **Office of the Data Protection Commissioner** at ${COMPANY.odpcUrl}.` },
      ],
    },
    {
      id: 'automated',
      title: 'Automated processing and tenant screening',
      blocks: [
        { type: 'p', text: `The app works out, from the payment history in your own records, a tenant payment-behaviour score, a risk level, warning flags and a suggested action (approve, conditional, review or reject). This is a tool for the landlord, calculated by software, based only on data in the landlord's account. **Samuhia does not use it to make decisions about anyone**; the landlord does, and it is not a credit report. Landlords should review a score before acting and must not rely on it alone. A tenant who thinks a score is wrong can ask the landlord to review the records, or write to us.` },
      ],
    },
    {
      id: 'storage-tech',
      title: 'Cookies, local storage and similar technology',
      blocks: [
        { type: 'p', text: `${COMPANY.product} does **not** use advertising cookies or third-party analytics. It uses browser or app storage that the app needs to work: your signed-in session, your local database, your settings (such as dark mode and saved payment instructions), cached app files so it opens offline (a service worker), and an in-app install and update prompt. You can clear this in your browser or app settings, but you may then be signed out and unsynchronised data on that device may be lost.` },
      ],
    },
    {
      id: 'children',
      title: 'Children',
      blocks: [
        { type: 'p', text: `${COMPANY.product} is for adults of ${POLICY.minimumAge} and over. We do not knowingly open accounts for children. Landlords are responsible for having a lawful basis to enter details about any minor occupant, and should avoid it unless needed. If you think a child has an account, write to us and we will act.` },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      blocks: [
        { type: 'p', text: `We may update this policy as the service or the law changes. The date and version at the top show when it last changed. For a material change we will give notice in the app, by email or by SMS before it takes effect.` },
      ],
    },
    {
      id: 'contact',
      title: 'Contact us',
      blocks: [
        { type: 'ul', items: [
          `**Company:** ${COMPANY.legalName}, ${COMPANY.location}.`,
          `**Privacy requests and questions:** [${COMPANY.email}](mailto:${COMPANY.email})`,
          `**WhatsApp:** [${COMPANY.whatsapp}](${COMPANY.whatsappHref})`,
          `**Regulator:** Office of the Data Protection Commissioner, [${COMPANY.odpcUrl}](${COMPANY.odpcUrl})`,
        ] },
      ],
    },
  ],
};
