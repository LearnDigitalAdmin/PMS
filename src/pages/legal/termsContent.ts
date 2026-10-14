// src/pages/legal/termsContent.ts
//
// Terms of Service for Plot Yangu. Plain data (see legalTypes.ts); rendered by LegalLayout.
// Behaviour described here was checked against this repo (PMS), PAY (payments, SMS top-ups, trial grant)
// and CYBER (Samuhia Desk). Section ids are anchors people link to: keep them stable.
import { COMPANY, POLICY } from './legalConfig';
import type { LegalDocument } from './legalTypes';

export const termsDocument: LegalDocument = {
  title: 'Terms of Service',
  description: `The terms that apply when you use ${COMPANY.product}, the property management app from ${COMPANY.legalName}: plans, M-Pesa payments, SMS credits, support desks, responsibilities and liability.`,
  intro: `These Terms are the agreement between you and ${COMPANY.legalName} for using ${COMPANY.product}. They cover how plans and payments work, how SMS credits and tenant messages work, what you and we are each responsible for, and what happens if something goes wrong. Please read them before you create an account.`,
  summaryTitle: 'The short version',
  summary: [
    `${COMPANY.product} is software that helps landlords and property agents keep properties, tenants, invoices and payments in order. **We are a software provider. We are not your property manager, agent, bank, lawyer or tax adviser.**`,
    `**You are responsible for your records and your tenants.** What you enter, the invoices you issue, the messages you send and your dealings with tenants are yours. Check them before you send them.`,
    `**SMS runs on prepaid credits.** Every message uses credits. Failed sends are refunded. You must only message people you are entitled to contact, and never for harassment, threats or marketing.`,
    `**Money is paid by M-Pesa through Paystack.** Subscriptions are prepaid and do not renew by themselves. Payments are final once confirmed, except in the cases listed in the [billing section](#billing).`,
    `**Support desks only act with your permission.** The Samuhia top desk is always connected; you can connect or remove other desks yourself. Everything a desk does for you is logged.`,
    `**Your data stays yours.** We use it to run the service, we do not sell it, and the [Privacy Policy](/privacy) explains exactly what is collected and why.`,
    `**Back up what matters.** On the Free plan your data lives on your device only. If the device is lost and you never synced, we cannot recover it.`,
    `Kenyan law governs these Terms. Questions: **${COMPANY.email}**.`,
  ],
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are and what Plot Yangu is',
      blocks: [
        { type: 'p', text: `${COMPANY.product} (the **Service**) is a property management application owned and operated by **${COMPANY.legalName}**, a business registered in ${COMPANY.country} and operating from ${COMPANY.location} ("**${COMPANY.shortName}**", "**we**", "**us**").${COMPANY.registrationNumber ? ` Our registration number is ${COMPANY.registrationNumber}.` : ''}` },
        { type: 'p', text: `The Service lets landlords, property agents and property managers record properties, units and tenants; produce invoices and statements; record and collect rent and other charges; send tenant notifications by SMS and WhatsApp; and, on paid plans, keep their data synchronised across devices. It is available as a web app at ${COMPANY.appUrl}, as an installable web app (PWA), as an Android app and as a desktop app.` },
        { type: 'p', text: `Payments for subscriptions, SMS credits and rent collection are processed through our payments system (the "**PAY**" platform, which uses Paystack and M-Pesa). Support and assisted services are provided through the **Samuhia Desk** network. Both are described below. They are part of the Service for the purposes of these Terms.` },
        { type: 'note', tone: 'info', title: 'We are a software provider', text: `${COMPANY.product} is a tool. We do not manage your properties, we are not a party to any tenancy agreement, we do not collect rent on your behalf in any legal capacity other than as described in the [rent payments section](#rent-payments), and we do not give legal, tax or financial advice.` },
      ],
    },
    {
      id: 'definitions',
      title: 'Words we use',
      blocks: [
        {
          type: 'table',
          head: ['Term', 'Meaning'],
          rows: [
            ['You / Account Holder', `The person or business that creates a ${COMPANY.product} account: a landlord, property agent, property manager or company. If you use the Service for a business, you confirm you can bind it to these Terms.`],
            ['Tenant', 'A person whose details you enter into the Service as a tenant, occupant or payer.'],
            ['Account Data', 'Information about you and your business that you give us to open and run your account (name, email, phone, National ID number, company details, plan and billing status).'],
            ['Your Data', 'Everything you put into the Service about properties, units, tenants, invoices, payments and related records, including Tenant details.'],
            ['SMS Credits', 'Prepaid units that pay for messages sent through the Service. See [SMS and tenant messaging](#sms).'],
            ['Cloud Sync', 'The feature that backs up and synchronises Your Data to our cloud systems so you can use several devices. Available on trial and paid plans.'],
            ['Desk', `A Samuhia Desk agent (for example COG-0001) that Samuhia has reviewed and activated and that can help with your account when you allow it. The **Top Desk** (COG-0000) is Samuhia's own desk.`],
            ['Landlord code', 'The code in your Settings (for example PYL-0001) that a desk uses to find your account.'],
            ['PAY / Payments', 'The Samuhia payments system that handles M-Pesa subscription payments, SMS credit purchases and rent collection, using Paystack.'],
          ],
        },
      ],
    },
    {
      id: 'account',
      title: 'Your account',
      blocks: [
        { type: 'p', text: `**Who can sign up.** You must be at least ${POLICY.minimumAge} years old and able to enter a binding contract under the laws of ${COMPANY.country}. The Service is not for children.` },
        { type: 'p', text: `**Accurate details.** To open an account we ask for your full name, email address, mobile number and National ID number, and optionally your company name, address, phone and email. You promise that these are yours, true and kept up to date. Your National ID number is used as your account identifier (see the [Privacy Policy](/privacy)). Do not register an account using someone else's identity.` },
        { type: 'p', text: `**Keep your sign-in safe.** You are responsible for your password, your devices and everything done through your account, including by staff or helpers you let use it. Tell us at once on ${COMPANY.email} if you think someone else has access. We may ask you to confirm your identity before we help with an account.` },
        { type: 'p', text: `**One account, one holder.** Do not share an account between unrelated businesses or sell, rent or transfer an account without our written agreement. If you manage properties for several landlords, you are responsible to each of them for the data you enter.` },
        { type: 'p', text: `**Signing in offline.** The app stores a protected copy of your sign-in information on your device so it can open without internet. Anyone who can unlock and use your device may be able to open the app. Use a device lock and sign out on shared devices.` },
      ],
    },
    {
      id: 'service',
      title: 'What the Service does, and what it does not',
      blocks: [
        { type: 'p', text: `**Records and documents come from what you enter.** Invoices, receipts, rent record sheets, landlord statements, commission summaries, arrears figures and reports are calculated from the information you (or a desk acting for you) entered. If the inputs are wrong or incomplete, the outputs will be too. Check every document before you send it or rely on it.` },
        { type: 'p', text: `**Not tax or legal documents.** Documents produced by the Service are business records. Unless a feature says otherwise, they are not tax invoices, are not issued through the Kenya Revenue Authority's systems, and are not legal notices under any tenancy law. You remain responsible for your own tax returns, VAT or rental income tax obligations, record-keeping, tenancy agreements, notices to vacate and any court or tribunal process.` },
        { type: 'p', text: `**Tenant screening is informational.** Where the Service shows tenant payment-behaviour scores, risk levels, warning flags or a recommended action, these are calculated automatically from the payment history in your own records. They are not a credit reference, not a report from a credit reference bureau and not a verdict about any person. A score built on a few months of data can be misleading. Do not use it as the only reason to refuse, evict or penalise anyone, and review it yourself before you act on it.` },
        { type: 'p', text: `**Offline first.** The app keeps your records on your device first, so you can keep working without a connection. Features that need the internet (sign-up, sign-in on a new device, Cloud Sync, SMS, WhatsApp, payments, desk requests and invoice links) work only when you are online.` },
        { type: 'p', text: `**Plan features and limits.** Which features you can use, how many properties and tenants you can hold, whether Cloud Sync and automated notifications are included, and how invoices are branded depend on your plan. The current plan details and limits are shown in the app and on the website at ${COMPANY.appUrl}. If you reach a limit you can still view existing records, but you may not be able to add more until you upgrade or reduce your records.` },
      ],
    },
    {
      id: 'plans',
      title: 'Plans, the free trial and downgrades',
      blocks: [
        { type: 'p', text: `**Free plan.** The Free plan has no time limit. It is restricted to a small number of properties and tenants, stores data on your device only (no Cloud Sync), and puts prominent ${COMPANY.product} branding on invoices.` },
        { type: 'p', text: `**Free trial.** When you create an account yourself, we give you a **3-month trial of the Business plan** with no card needed, together with **50 free SMS Credits**. The trial includes the Business plan's limits and features, including Cloud Sync, for its length. The trial ends automatically on its end date shown in the app. It does not turn into a paid subscription; nothing is charged unless you choose to pay. Trial SMS Credits are a gift: they have no cash value, cannot be refunded or transferred, and do not earn desk commission. We may limit the trial to one per person or business and may end it for misuse.` },
        { type: 'p', text: `**What happens when a trial or subscription ends.** Our systems check for expired trials and subscriptions weekly, so there can be a short delay between the end date and the change. When one ends, your account returns to the Free plan: Cloud Sync and automated notifications stop, branding and limits revert to Free, and you may be unable to add or edit records above the Free limits. **Data already on your device stays on your device.** We do not delete your cloud data at that moment, but we cannot promise to keep unsynchronised cloud copies available on the Free plan indefinitely. Export or upgrade before your plan ends if you need continuity.` },
        { type: 'p', text: `**Changing plans.** You can upgrade at any time. Features and limits change when your payment is confirmed. Downgrading, or letting a subscription end, does not entitle you to a refund of the unused part of a period already paid, except as set out in the [billing section](#billing).` },
        { type: 'p', text: `**Android app purchases.** If you subscribe inside the Android app through Google Play, Google Play's billing terms apply to that purchase, and the store (not us) handles that payment, renewals and its refund rules. Subscriptions paid by M-Pesa through our website or app are covered by the [billing section](#billing).` },
      ],
    },
    {
      id: 'billing',
      title: 'Prices, payments and refunds',
      blocks: [
        { type: 'p', text: `**Prices.** All prices are in Kenya Shillings (KES) and are shown in the app before you pay. The amount shown at checkout is the amount you pay. We may change prices for future purchases; a change never affects a period or a credit purchase you have already paid for. If a tax applies to a purchase, it is shown at checkout or included in the price shown.` },
        { type: 'p', text: `**How you pay.** You pay by **M-Pesa**. After you confirm a purchase, a prompt appears on the phone number you entered and you approve it by entering your M-Pesa PIN **on your own phone**. We never see or store your PIN. The payment is processed by **Paystack** using M-Pesa. You must only use an M-Pesa number that belongs to you, or whose owner has agreed to the payment.` },
        { type: 'p', text: `**Prepaid, no automatic renewal.** Subscriptions bought by M-Pesa are prepaid and **do not renew automatically**. You choose when to pay again. A monthly plan gives you **30 days** and an annual plan **365 days**, counted from the moment we receive Paystack's confirmation of your payment. Paying while time remains on your current plan starts the new period from the confirmation date; unused days are not added on top. To avoid losing time, pay close to the end of your current period.` },
        { type: 'p', text: `**Confirmation.** Plans and credits are applied only after Paystack confirms the payment to our systems, which normally takes moments but can take longer when networks are slow. If you approved the M-Pesa prompt and nothing has been applied after a reasonable time, keep your M-Pesa confirmation message and contact us (see below). A prompt you do not approve, or that times out, is not a charge and activates nothing.` },
        { type: 'p', text: `**Refunds.** Plans and SMS Credits are digital services delivered when your payment is confirmed, so purchases are **final**, except that we will correct or refund the following if you tell us within **${POLICY.paymentDisputeDays} days** of the payment:` },
        {
          type: 'ul',
          items: [
            'you were charged twice for the same purchase;',
            'your payment was confirmed but the plan or credits were not applied and we cannot apply them;',
            'the amount charged was different from the amount shown at checkout; or',
            'a refund is required by law.',
          ],
        },
        { type: 'p', text: `Send the M-Pesa confirmation code, the phone number used, the date and the amount to ${COMPANY.email}. Where we refund, we return the money to the M-Pesa number that paid, or give credit, as we agree with you; the time it takes depends on Paystack and Safaricom. Messages that fail to send are refunded automatically as SMS Credits (see [SMS and tenant messaging](#sms)).` },
        { type: 'p', text: `**Reversed or disputed payments.** If a payment is reversed or disputed after we have delivered the service, we may remove the plan or credits it paid for, suspend features until the amount is resolved, and recover the amount from you.` },
        { type: 'p', text: `**Desk commission.** A Samuhia Desk (or the agent who onboarded your account) may earn a share of the subscription and SMS Credit payments made by accounts connected to it. The share comes out of the payment through the payment split; **it does not increase what you pay**. Free signup credits and trial grants earn no commission.` },
        { type: 'p', text: `**Rent collection fees.** Fees that apply when tenants pay rent through Plot Yangu Payments are described in the [rent payments section](#rent-payments).` },
      ],
    },
    {
      id: 'sms',
      title: 'SMS and tenant messaging',
      blocks: [
        { type: 'p', text: `${COMPANY.product} can send SMS messages to your tenants, and WhatsApp messages as a backup, from your account. These messages are sent **by you** (or by a desk you authorised, or automatically on your behalf). You are the sender; we deliver them.` },
        { type: 'p', text: `**SMS Credits.** Messages use prepaid SMS Credits. One credit covers roughly 144 to 150 characters of the **whole** message (greeting, your text and the sender signature together); a longer message uses more credits. A message sent from the app is priced on its final text, not just the part you typed. A WhatsApp message sent as a backup uses **2 credits** on the Professional and Enterprise plans and **3 credits** on every other plan.` },
        { type: 'p', text: `**Buying credits.** You buy credits by M-Pesa. The minimum purchase is 10 credits. The price per credit depends on your plan, is shown before you pay, and is always calculated by our systems from your actual plan; the amount shown at checkout governs. Credits belong to one account, have no cash value, cannot be transferred, withdrawn or resold, and are not refundable except as set out in the [billing section](#billing). We do not currently expire purchased credits.` },
        { type: 'p', text: `**When credits are charged, and refunds.** Credits are reserved when you send. A message counts as sent when our SMS gateway accepts it for delivery. If it is rejected, the credits are returned to your balance automatically. **We cannot guarantee that a message reaches a phone.** Delivery depends on mobile networks and the recipient's phone (switched off, out of coverage, blocked senders or number errors). Credits for messages the gateway accepted are not refunded if the message is later delayed or not delivered.` },
        { type: 'p', text: `**How messages look.** Messages you compose are sent in the form "Dear (tenant name), (your text) - (your company or name, your phone number)". The SMS sender name is shared across ${COMPANY.product}, so this signature is how a tenant knows who the message is from; you cannot remove it. For your messages and your tenants' safety, the text must use plain letters, numbers and common punctuation; links, emojis, symbols and line breaks are not accepted. A single send, from the app or by a desk, can go to at most 200 recipients.` },
        { type: 'p', text: `**Automatic notifications.** On trial and paid plans with Cloud Sync switched on, the Service can automatically message a tenant when a new invoice is created, when a payment is received and when an invoice becomes overdue. Which of these are available depends on your plan: new-invoice messages on all eligible plans, overdue reminders from Solo upward, and payment confirmations on Professional and Enterprise. Automatic notifications run only while your account has synchronised recently, and only while you have the credits to pay for them. If an SMS cannot be sent, the Service may use WhatsApp as a backup for tenants who have allowed WhatsApp messages. Automatic messages use your credits like any other.` },
        { type: 'p', text: `**Invoice links.** An automatic message may include a short link to the invoice PDF at ${COMPANY.appUrl}/i/... Anyone who has the link can open that invoice, so treat the link like the invoice itself. The link always opens the latest version of that invoice. We may disable links, for example when an account is closed.` },
        { type: 'p', text: `**WhatsApp.** WhatsApp messages are sent through Meta's WhatsApp Business Platform, using message templates, only to tenants who have allowed them through the consent message we send, and not to a tenant who has chosen to stop. We keep a record of each tenant's choice. WhatsApp's own terms also apply to those messages.` },
        { type: 'note', tone: 'warn', title: 'Your duties when you message tenants', text: `Message only people you have a genuine, lawful reason to contact about their tenancy (rent, invoices, payments, notices, maintenance). Make sure each number is right and belongs to that tenant. Do not use ${COMPANY.product} for advertising, promotions, political messages, chain messages, threats, harassment, shaming of people who owe money, or anything that reveals one person's information to another. If someone asks you to stop messaging them, stop and remove or update their number. You are responsible for telling your tenants that you will contact them this way and for having the right to do so under Kenyan law, including the Data Protection Act, 2019.` },
        { type: 'p', text: `**Misuse.** We may block or reject messages, pause sending, cancel credits that were obtained or used through abuse, and report unlawful use to the authorities. We do not write, review or approve your messages and are not responsible for what they say.` },
        { type: 'p', text: `**Messages sent by a desk.** A desk you have connected can send, or schedule, messages to your tenants for you, using your credits, under these same rules and with your signature on them. You are responsible for those messages as the sender. If you remove a desk, it can no longer take new actions for you, but **messages it already scheduled are not cancelled automatically**: contact us on ${COMPANY.email} if you want a schedule stopped.` },
      ],
    },
    {
      id: 'rent-payments',
      title: 'Collecting rent through Plot Yangu Payments',
      blocks: [
        { type: 'p', text: `Plot Yangu Payments is an optional feature that lets your tenants pay you by M-Pesa and records the payment against the right invoice. It runs on our PAY platform, with Paystack and M-Pesa carrying out the payment itself.` },
        { type: 'ol', items: [
          `You give us a **settlement account**: an M-Pesa number, bank account, paybill or till that should receive your money. We set it up with Paystack as your payment account. You can ask us to do this, or use the Payments page in the app.`,
          `A tenant starts a payment and approves the M-Pesa prompt on their own phone.`,
          `Paystack takes the payment, **deducts its own processing fee**, and splits the rest between **your settlement account** and **Samuhia's platform fee**, then settles to you on Paystack's and the receiving bank's or M-Pesa's timelines.`,
          `Plot Yangu records the payment against the invoice.`,
        ] },
        { type: 'p', text: `**Fees.** Samuhia's platform fee is shown in your Payments page and may be changed on notice under the [changes section](#changes). Paystack's and the payment networks' charges apply in addition and are taken out of each payment before settlement. You agree to those deductions.` },
        { type: 'p', text: `**We are not a bank.** We do not take deposits or hold balances for you. Money moves through Paystack and the mobile money or banking networks, whose terms and timelines apply, and which we do not control. We are not responsible for delays or failures in their systems.` },
        { type: 'p', text: `**Your responsibilities.** You are responsible for entering your settlement details correctly (money sent to a wrong account may not be recoverable), for the correctness of the invoices tenants pay, for any dispute with a tenant about an amount, for any refund you choose to make to a tenant, for the tax on the rent you receive, and for obeying the law on rent and deposits. A payment recorded in the app by you manually (cash, bank transfer, a payment made outside Plot Yangu) is only your own record: we have not received or checked that money.` },
        { type: 'p', text: `**Reversals and checks.** If a payment is reversed, charged back or found to be fraudulent, we or Paystack may recover it from later settlements and we may reverse the record. We may delay, hold or refuse a payment, and ask you for identity or business documents, where the law, Paystack, or a payment network requires it, or where we reasonably suspect misuse or fraud.` },
      ],
    },
    {
      id: 'desk',
      title: 'Samuhia Desk and support agents',
      blocks: [
        { type: 'p', text: `Samuhia Desk is our network of support and assisted-service agents. A desk can help you with things such as importing tenants, sending reminders and answering questions. Desks are reviewed, registered and activated by Samuhia, and can be suspended or closed by us.` },
        { type: 'ul', items: [
          `**The Top Desk (COG-0000)** is Samuhia's own desk. It is always connected to every account and cannot be removed.`,
          `**Other desks.** You can connect up to **5** other desks from Settings by entering a desk code (for example COG-0001), and remove them at any time. Only an active desk can be connected.`,
          `**Landlord code.** Your Landlord code (for example PYL-0001) is how a desk finds your account. Share it only with desks you trust.`,
          `**Requests.** From Desk requests in the app you can ask a desk for help, up to **5 requests a day**, and see the replies.`,
        ] },
        { type: 'p', text: `**What a connected desk can do for you.** With your permission, through our secure desk connection, a desk can: see your account summary (business name, your name and phone, plan and SMS Credit balance); validate and import tenants (it can **add** new tenants but cannot change or delete existing ones); see a list of your tenants with phone numbers partly hidden and the amount each owes; export your tenant list as a file (with full phone numbers and tenancy details) through a download link that expires after one hour; and send or schedule SMS to your tenants using your credits. Tenants and properties you have marked as restricted are left out.` },
        { type: 'p', text: `**What a desk cannot do.** A desk cannot see your password, sign in as you, edit or delete your existing records, or move your money. Desks cannot use these tools for anyone who has not connected them (the Top Desk excepted, because it is always connected).` },
        { type: 'p', text: `**Logging.** Every action a desk takes through this connection is recorded in an audit trail (which action, which account, which desk and when).` },
        { type: 'p', text: `**Your responsibility.** By connecting a desk, you authorise it to take those actions for you. You are responsible for who you connect and for the instructions you give. Check the work a desk does for you; if a desk acts outside what this section allows, tell us on ${COMPANY.email} and we will investigate and, where needed, suspend it.` },
      ],
    },
    {
      id: 'your-duties',
      title: 'Your responsibilities',
      blocks: [
        { type: 'p', text: 'You agree that you will:' },
        { type: 'ul', items: [
          `use ${COMPANY.product} only for lawful property management and related business, and follow the laws that apply to you, including tenancy, rent, deposit, tax, consumer and data protection laws of ${COMPANY.country};`,
          `have the right to put each tenant's details into the Service, tell tenants how you use their information, and respond to tenants who ask you about it (**for Tenant details, you decide why and how they are used; we process them for you**: see the [Privacy Policy](/privacy));`,
          `check amounts, dates, readings, tenant details and every document before you send or rely on it;`,
          `keep your device, passwords, desk codes and settlement details secure, and use your own device lock;`,
          `back up what matters. On the Free plan, and between syncs on any plan, your records exist **only on your device**. Data on a lost, reset, broken or uninstalled device may be lost for good. Use Cloud Sync (where your plan includes it) and the export tools, and keep copies you need;`,
          `give us true information and tell us promptly when it changes; and`,
          `cooperate with us if we ask for information to investigate misuse, a payment problem or a legal request.`,
        ] },
      ],
    },
    {
      id: 'acceptable-use',
      title: 'What you must not do',
      blocks: [
        { type: 'ul', items: [
          'break the law, or help anyone else do so, through the Service;',
          'harass, threaten, intimidate or unlawfully evict a tenant, or use the Service to shame or expose tenants;',
          'send spam, marketing, scam or misleading messages, or impersonate another person or business;',
          `enter someone else's personal data without a lawful reason, or use the Service to collect data about people you have no business dealing with;`,
          `use another person's identity, phone number or payment details without permission;`,
          'bypass or interfere with plan limits, SMS Credit charging, security features, rate limits or the payment system, or create accounts to repeat a free trial;',
          'resell SMS Credits or message capacity, or run a bulk-messaging business through the Service;',
          'copy, decompile, reverse-engineer, scrape or attack the Service, or upload malware;',
          'overload our systems or the networks and providers we use; or',
          'use the Service in a way that could damage Samuhia, its users or its providers.',
        ] },
      ],
    },
    {
      id: 'data',
      title: 'Your data and our rights',
      blocks: [
        { type: 'p', text: `**Your Data is yours.** You keep all rights in Your Data. You give us permission to store, process, display, back up and transmit it only as needed to provide the Service to you, including sending messages and documents you or your desk ask for, and as the law requires. We do not sell Your Data. The [Privacy Policy](/privacy) explains what we collect, who handles it and how long we keep it.` },
        { type: 'p', text: `**Our roles.** For Account Data, we decide how it is used and are the "data controller" under the Data Protection Act, 2019. For Tenant details and other records you enter about other people, **you** are the controller and we are your "data processor": we handle them on your instructions to run the Service. You are responsible for having a lawful basis and for the notices that the law requires you to give your tenants.` },
        { type: 'p', text: `**Export and closing.** You can use the export and sharing tools in the app, and a desk can export your tenant list at your request. You can ask us to close your account at any time (see [Ending your account](#ending)).` },
        { type: 'p', text: `**Our property.** The Service, its software, design, text, logos and the names ${COMPANY.product} and ${COMPANY.shortName} belong to ${COMPANY.legalName} or its licensors. We give you a limited, personal, non-exclusive, non-transferable right to use the Service under these Terms. Invoices carry ${COMPANY.product} branding on the plans that include it; you may not remove it. If you send us feedback or ideas, we may use them without owing you anything.` },
        { type: 'p', text: `**Your branding.** If you upload your company name or logo, you confirm you have the right to use it and allow us to show it on your invoices and messages.` },
      ],
    },
    {
      id: 'availability',
      title: 'Availability, updates and outside providers',
      blocks: [
        { type: 'p', text: `We work to keep the Service available but **do not promise it will be uninterrupted or error-free**. We may carry out maintenance, update the apps (some updates may be needed to keep using the Service), change or retire features, and change plan limits, with notice where the change is material.` },
        { type: 'p', text: `The Service depends on outside systems that we do not control: mobile networks, Safaricom M-Pesa, Paystack, Google Cloud and Firebase, our SMS gateway, Meta's WhatsApp platform and Google Play. Outages, delays, rule changes or errors in those systems can affect messages, payments, sign-in and sync. We are not responsible for them, but we will try to tell you about significant disruptions and help you recover.` },
        { type: 'p', text: `Events beyond our reasonable control (including power or network failures, cyber-attacks, government action, strikes, floods, epidemics or the failure of a provider) excuse delay or failure on either side to the extent they cause it.` },
      ],
    },
    {
      id: 'ending',
      title: 'Ending your account, and suspension',
      blocks: [
        { type: 'p', text: `**By you.** You can stop using the Service at any time. To close your account and have your cloud data removed, email ${COMPANY.email} from the address on the account (we may check your identity). We will delete or anonymise your cloud data within **${POLICY.deletionDays} days** of confirming your request, except for records we must keep by law (such as payment records, for ${POLICY.financialRecordYears} years). Data on your own devices is yours to delete. Closing an account does not entitle you to a refund and unused SMS Credits are lost.` },
        { type: 'p', text: `**By us.** We may suspend or end your access, remove content, or refuse a transaction, with notice where we reasonably can, if: you break these Terms; you misuse messaging or payments; we suspect fraud or an unlawful purpose; a payment is reversed or unpaid; the law, a court, a regulator or a provider requires it; or the Service is being withdrawn. If we end your account without a breach on your part, we will give you at least **${POLICY.changeNoticeDays} days' notice** and a chance to export your data, and refund the unused part of any paid period.` },
        { type: 'p', text: `Sections that by their nature should continue after the account ends (including payments owed, liability, indemnity, governing law and data retention) continue.` },
      ],
    },
    {
      id: 'liability',
      title: 'What we promise, and what we are not responsible for',
      blocks: [
        { type: 'p', text: `We provide the Service with reasonable skill and care. Beyond what these Terms say, **the Service is provided "as is" and "as available"**, and we give no promise that it will meet your particular needs, always be accurate, available or free of errors, or that messages will be delivered or payments settled by a set time.` },
        { type: 'p', text: `To the fullest extent the law allows, we are **not liable** for: loss of rent, income, profit or business; losses from wrong data you or a desk entered; disputes, claims, evictions or legal proceedings between you and a tenant or any other person; messages not delivered, delayed or misunderstood; money sent to the wrong account because of details you gave us; losses caused by Safaricom, Paystack, mobile networks, Google, Meta, Google Play or any other outside provider; loss of data stored only on your device, or lost because you did not sync or back up; and indirect or consequential loss.` },
        { type: 'p', text: `Our total liability to you for all claims arising out of or in connection with the Service in any 12-month period is limited to the greater of: the amount you paid us for the Service in the 12 months before the event that gave rise to the claim, and **KES ${POLICY.liabilityFloorKes.toLocaleString('en-KE')}**.` },
        { type: 'note', tone: 'info', title: 'What these limits do not do', text: `Nothing in these Terms limits or excludes liability for fraud, for death or personal injury caused by negligence, or for anything else that cannot lawfully be limited, and nothing takes away rights you have under the Consumer Protection Act, 2012 or the Data Protection Act, 2019 that cannot be waived.` },
        { type: 'p', text: `**Indemnity.** You will compensate us for losses, costs and claims (including reasonable legal fees) that arise from your breach of these Terms, your unlawful use of the Service, your messages, or a claim by a tenant or other person about information you entered or actions you took through the Service. This does not apply to the extent we caused the loss through our own fraud or gross negligence.` },
      ],
    },
    {
      id: 'general',
      title: 'General terms',
      blocks: [
        { type: 'ul', items: [
          `**Entire agreement.** These Terms and the [Privacy Policy](/privacy), together with prices, limits and instructions shown in the app at the time you buy, are the whole agreement between you and ${COMPANY.legalName} about the Service.`,
          `**Notices.** We may notify you in the app, by email, by SMS or on our websites. You can notify us at ${COMPANY.email}. A notice we send to the contact details on your account counts as received when sent.`,
          `**If part is invalid.** If a court finds part of these Terms unenforceable, the rest stays in force.`,
          `**No waiver.** If we do not enforce a right immediately, we have not given it up.`,
          `**Transfer.** You may not transfer your rights under these Terms. We may transfer ours as part of a business transfer, with notice to you, if your rights are not reduced.`,
          `**Language.** These Terms are written in English. Where we give a translation, the English text prevails.`,
        ] },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to these Terms',
      blocks: [
        { type: 'p', text: `We may update these Terms, for example when features, prices, fees or the law change. We will post the new version here with a new date and version number. For a **material** change we will give you at least **${POLICY.changeNoticeDays} days' notice** in the app, by email or by SMS before it takes effect. If you do not accept the change, you may stop using the Service and close your account before it takes effect. Using the Service after the change takes effect means you accept it. Changes required by law, or that fix an error or add a feature without reducing your rights, may take effect immediately.` },
      ],
    },
    {
      id: 'law',
      title: 'Governing law and disagreements',
      blocks: [
        { type: 'p', text: `These Terms are governed by the laws of ${COMPANY.country}. If you have a complaint or dispute, first write to ${COMPANY.email} so we can try to settle it in good faith; we aim to reply within 14 days. If we cannot settle it within ${POLICY.changeNoticeDays} days, either of us may refer it to mediation in ${COMPANY.location.split(',')[0]}, and, failing that, to the courts of ${COMPANY.country}, which have jurisdiction (the court at ${COMPANY.location.split(',')[0]} being the first choice of venue where the law allows a choice). Complaints about how we handle personal data may also be made to the **Office of the Data Protection Commissioner** (${COMPANY.odpcUrl}). Nothing here stops either of us from asking a court for urgent relief.` },
      ],
    },
    {
      id: 'contact',
      title: 'Contact us',
      blocks: [
        { type: 'ul', items: [
          `**Company:** ${COMPANY.legalName}, ${COMPANY.location}.${COMPANY.registrationNumber ? ` Registration no. ${COMPANY.registrationNumber}.` : ''}`,
          `**Email:** [${COMPANY.email}](mailto:${COMPANY.email}) (sales: [${COMPANY.salesEmail}](mailto:${COMPANY.salesEmail}))`,
          `**WhatsApp:** [${COMPANY.whatsapp}](${COMPANY.whatsappHref})`,
          `**Website:** [${COMPANY.website}](${COMPANY.website})`,
        ] },
      ],
    },
  ],
};
