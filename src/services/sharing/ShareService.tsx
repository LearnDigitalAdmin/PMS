// ShareService.tsx - Multi-platform Sharing Integration
import { Share } from '@capacitor/share';
//import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';
import { Browser } from '@capacitor/browser';
import { formatCurrency, formatDate } from '../../utils/FormatUtils';
import type { InvoiceWithDetails, Property } from '../database/Database';

export interface ShareOptions {
  subject?: string;
  text?: string;
  url?: string;
  files?: string[];
  dialogTitle?: string;
}

export interface WhatsAppMessageOptions {
  phoneNumber?: string;
  message: string;
}

export interface EmailOptions {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments?: string[];
  isHtml?: boolean;
}

/**
 * Shares content via WhatsApp with formatted message
 */
export async function shareViaWhatsApp(
  invoice: InvoiceWithDetails,
  property: Property,
  options: Partial<WhatsAppMessageOptions> = {}
): Promise<void> {
  try {
    const message = options.message || generateWhatsAppMessage(invoice, property);
    const phoneNumber = options.phoneNumber || invoice.tenantPhone || '';
    
    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    
    const whatsappUrl = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    
    // Check if device supports native sharing
    const deviceInfo = await Device.getInfo();
    
    if (deviceInfo.platform === 'web') {
      // For web, open WhatsApp Web
      await Browser.open({ url: whatsappUrl });
    } else {
      // For mobile, try native sharing first, fallback to web
      try {
        await Share.share({
          text: message,
          dialogTitle: 'Share via WhatsApp'
        });
      } catch (shareError) {
        await Browser.open({ url: whatsappUrl });
      }
    }
  } catch (error) {
    console.error('WhatsApp sharing failed:', error);
    throw new Error('Failed to share via WhatsApp. Please check if WhatsApp is installed.');
  }
}

/**
 * Shares invoice via email with professional formatting
 */
export async function shareViaEmail(
  invoice: InvoiceWithDetails,
  property: Property,
  options: Partial<EmailOptions> = {}
): Promise<void> {
  try {
    const subject = options.subject || `Invoice ${invoice.invoiceNumber} - ${property.name}`;
    const body = options.body || generateEmailBody(invoice, property);
    const to = options.to || (invoice.tenantEmail ? [invoice.tenantEmail] : []);
    
    const emailUrl = constructEmailUrl({
      to,
      subject,
      body: body,
      isHtml: options.isHtml || false
    });
    
    // Check device capability
    const deviceInfo = await Device.getInfo();
    
    if (deviceInfo.platform === 'web') {
      // For web, open default email client
      window.location.href = emailUrl;
    } else {
      // For mobile, try native sharing
      try {
        await Share.share({
          title: subject,
          text: body,
          dialogTitle: 'Share Invoice via Email'
        });
      } catch (shareError) {
        // Fallback to email URL
        await Browser.open({ url: emailUrl });
      }
    }
  } catch (error) {
    console.error('Email sharing failed:', error);
    throw new Error('Failed to share via email. Please check your email app configuration.');
  }
}

/**
 * Generic file sharing function
 */
export async function shareFile(
  filePath: string,
  options: ShareOptions = {}
): Promise<void> {
  try {
    await Share.share({
      title: options.subject || 'Share File',
      text: options.text || '',
      url: filePath,
      dialogTitle: options.dialogTitle || 'Share'
    });
  } catch (error) {
    console.error('File sharing failed:', error);
    throw new Error('Failed to share file. Please try again.');
  }
}

/**
 * Shares invoice summary as text
 */
export async function shareInvoiceSummary(
  invoice: InvoiceWithDetails,
  property: Property,
  options: ShareOptions = {}
): Promise<void> {
  try {
    const summary = generateInvoiceSummary(invoice, property);
    
    await Share.share({
      title: options.subject || `Invoice ${invoice.invoiceNumber}`,
      text: summary,
      dialogTitle: options.dialogTitle || 'Share Invoice Summary'
    });
  } catch (error) {
    console.error('Invoice summary sharing failed:', error);
    throw new Error('Failed to share invoice summary. Please try again.');
  }
}

/**
 * Shares payment reminder message
 */
export async function sharePaymentReminder(
  invoice: InvoiceWithDetails,
  property: Property,
  daysOverdue: number = 0
): Promise<void> {
  try {
    const message = generatePaymentReminderMessage(invoice, property, daysOverdue);
    
    await Share.share({
      title: 'Payment Reminder',
      text: message,
      dialogTitle: 'Send Payment Reminder'
    });
  } catch (error) {
    console.error('Payment reminder sharing failed:', error);
    throw new Error('Failed to share payment reminder. Please try again.');
  }
}

/**
 * Bulk share multiple invoices
 */
export async function shareBulkInvoices(
  invoices: InvoiceWithDetails[],
  properties: Property[],
  options: ShareOptions = {}
): Promise<void> {
  try {
    const summary = generateBulkInvoiceSummary(invoices, properties);
    
    await Share.share({
      title: options.subject || `${invoices.length} Invoices Summary`,
      text: summary,
      dialogTitle: options.dialogTitle || 'Share Invoices Summary'
    });
  } catch (error) {
    console.error('Bulk invoice sharing failed:', error);
    throw new Error('Failed to share bulk invoices. Please try again.');
  }
}

// ==================== MESSAGE GENERATORS ====================

/**
 * Generates WhatsApp message for invoice
 */
function generateWhatsAppMessage(invoice: InvoiceWithDetails, property: Property): string {
  const dueDate = invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : 'N/A';
  const balanceDue = invoice.totalAmount - invoice.amountPaid;
  
  return `🏠 *RENT INVOICE*
  
📋 *Invoice Details:*
• Invoice #: ${invoice.invoiceNumber}
• Property: ${property.name}
• Tenant: ${invoice.tenantName}
• Billing Period: ${invoice.billingMonth}

💰 *Amount Breakdown:*
• Monthly Rent: ${formatCurrency(invoice.rentAmount)}
${invoice.waterCurrentReading > 0 ? `• Water Usage: ${formatCurrency((invoice.waterCurrentReading - invoice.waterPreviousReading) * invoice.waterUnitPrice + invoice.waterStandingFee)}` : ''}
${invoice.powerCurrentReading > 0 ? `• Electricity: ${formatCurrency((invoice.powerCurrentReading - invoice.powerPreviousReading) * invoice.powerUnitPrice)}` : ''}
${invoice.otherCharges > 0 ? `• ${invoice.otherChargesDescription || 'Other Charges'}: ${formatCurrency(invoice.otherCharges)}` : ''}

📊 *Summary:*
• Total Amount: ${formatCurrency(invoice.totalAmount)}
• Amount Paid: ${formatCurrency(invoice.amountPaid)}
• *Balance Due: ${formatCurrency(balanceDue)}*

📅 Due Date: ${dueDate}

${balanceDue > 0 ? '⚠️ Please make payment as soon as possible to avoid late fees.' : '✅ Thank you! This invoice has been paid in full.'}

For any queries, please contact us.`;
}

/**
 * Generates professional email body
 */
function generateEmailBody(invoice: InvoiceWithDetails, property: Property): string {
  const dueDate = invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : 'N/A';
  const balanceDue = invoice.totalAmount - invoice.amountPaid;
  const waterAmount = invoice.waterCurrentReading > 0 ? 
    (invoice.waterCurrentReading - invoice.waterPreviousReading) * invoice.waterUnitPrice + invoice.waterStandingFee : 0;
  const powerAmount = invoice.powerCurrentReading > 0 ? 
    (invoice.powerCurrentReading - invoice.powerPreviousReading) * invoice.powerUnitPrice : 0;

  return `Dear ${invoice.tenantName},

I hope this email finds you well. Please find below your rental invoice for ${property.name}.

INVOICE DETAILS
===============
Invoice Number: ${invoice.invoiceNumber}
Billing Period: ${invoice.billingMonth}
Due Date: ${dueDate}

CHARGES BREAKDOWN
================
Monthly Rent: ${formatCurrency(invoice.rentAmount)}
${waterAmount > 0 ? `Water Usage (${invoice.waterCurrentReading - invoice.waterPreviousReading} units): ${formatCurrency(waterAmount)}` : ''}
${powerAmount > 0 ? `Electricity (${invoice.powerCurrentReading - invoice.powerPreviousReading} units): ${formatCurrency(powerAmount)}` : ''}
${invoice.otherCharges > 0 ? `${invoice.otherChargesDescription || 'Other Charges'}: ${formatCurrency(invoice.otherCharges)}` : ''}

PAYMENT SUMMARY
==============
Total Amount: ${formatCurrency(invoice.totalAmount)}
Amount Paid: ${formatCurrency(invoice.amountPaid)}
Balance Due: ${formatCurrency(balanceDue)}

${balanceDue > 0 ? 
  `Please make payment of ${formatCurrency(balanceDue)} by ${dueDate} to avoid late fees.` : 
  'Thank you for your prompt payment. This invoice has been settled in full.'
}

Should you have any questions regarding this invoice, please don't hesitate to contact us.

Best regards,
Property Management Team`;
}

/**
 * Generates invoice summary text
 */
function generateInvoiceSummary(invoice: InvoiceWithDetails, property: Property): string {
  const balanceDue = invoice.totalAmount - invoice.amountPaid;
  
  return `INVOICE SUMMARY

Property: ${property.name}
Tenant: ${invoice.tenantName}
Invoice #: ${invoice.invoiceNumber}
Period: ${invoice.billingMonth}

Total Amount: ${formatCurrency(invoice.totalAmount)}
Paid: ${formatCurrency(invoice.amountPaid)}
Balance: ${formatCurrency(balanceDue)}

Status: ${balanceDue > 0 ? 'UNPAID' : 'PAID'}
${invoice.dueDate ? `Due: ${formatDate(new Date(invoice.dueDate))}` : ''}`;
}

/**
 * Generates payment reminder message
 */
function generatePaymentReminderMessage(
  invoice: InvoiceWithDetails,
  property: Property,
  daysOverdue: number
): string {
  const balanceDue = invoice.totalAmount - invoice.amountPaid;
  const urgencyLevel = daysOverdue > 30 ? 'URGENT' : daysOverdue > 7 ? 'IMPORTANT' : 'FRIENDLY';
  
  let greeting = '';
  let tone = '';
  
  switch (urgencyLevel) {
    case 'URGENT':
      greeting = '🚨 URGENT PAYMENT REMINDER';
      tone = 'This is a final reminder that your rent payment is significantly overdue.';
      break;
    case 'IMPORTANT':
      greeting = '⚠️ PAYMENT REMINDER';
      tone = 'We notice that your rent payment is overdue.';
      break;
    default:
      greeting = '💌 FRIENDLY PAYMENT REMINDER';
      tone = 'This is a friendly reminder about your upcoming rent payment.';
  }

  return `${greeting}

Dear ${invoice.tenantName},

${tone}

PAYMENT DETAILS:
Property: ${property.name}
Invoice #: ${invoice.invoiceNumber}
Amount Due: ${formatCurrency(balanceDue)}
${invoice.dueDate ? `Due Date: ${formatDate(new Date(invoice.dueDate))}` : ''}
${daysOverdue > 0 ? `Days Overdue: ${daysOverdue}` : ''}

${urgencyLevel === 'URGENT' ? 
  'Please contact us immediately to arrange payment or discuss payment options.' :
  'Please arrange for payment at your earliest convenience.'
}

Thank you for your attention to this matter.`;
}

/**
 * Generates bulk invoices summary
 */
function generateBulkInvoiceSummary(invoices: InvoiceWithDetails[], properties: Property[]): string {
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
  const totalOverdue = invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);
  const paidCount = invoices.filter(inv => inv.isPaid).length;
  const unpaidCount = invoices.length - paidCount;

  const propertyMap = properties.reduce((map, prop) => {
    map[prop.id] = prop.name;
    return map;
  }, {} as Record<number, string>);

  let summary = `INVOICES SUMMARY (${invoices.length} invoices)

TOTALS:
Total Billed: ${formatCurrency(totalAmount)}
Total Paid: ${formatCurrency(totalPaid)}
Outstanding: ${formatCurrency(totalOverdue)}

STATUS:
Paid: ${paidCount}
Unpaid: ${unpaidCount}

BREAKDOWN:
`;

  invoices.forEach(invoice => {
    const propertyName = propertyMap[invoice.propertyId] || 'Unknown Property';
    const balance = invoice.totalAmount - invoice.amountPaid;
    summary += `• ${invoice.tenantName} (${propertyName}): ${formatCurrency(balance)} ${balance > 0 ? 'DUE' : 'PAID'}\n`;
  });

  return summary;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Constructs email URL for mailto links
 */
function constructEmailUrl(options: EmailOptions): string {
  const params = new URLSearchParams();
  
  if (options.to && options.to.length > 0) {
    params.append('to', options.to.join(','));
  }
  
  if (options.cc && options.cc.length > 0) {
    params.append('cc', options.cc.join(','));
  }
  
  if (options.bcc && options.bcc.length > 0) {
    params.append('bcc', options.bcc.join(','));
  }
  
  if (options.subject) {
    params.append('subject', options.subject);
  }
  
  if (options.body) {
    params.append('body', options.body);
  }
  
  return `mailto:?${params.toString()}`;
}

/**
 * Validates sharing capabilities
 */
export async function checkSharingCapabilities(): Promise<{
  canShare: boolean;
  canShareFiles: boolean;
  platform: string;
}> {
  try {
    const deviceInfo = await Device.getInfo();
    const canShare = await Share.canShare();
    
    return {
      canShare: canShare.value,
      canShareFiles: canShare.value && deviceInfo.platform !== 'web',
      platform: deviceInfo.platform
    };
  } catch (error) {
    console.error('Error checking sharing capabilities:', error);
    return {
      canShare: false,
      canShareFiles: false,
      platform: 'unknown'
    };
  }
}

/**
 * Sanitizes text for sharing (removes special characters that might cause issues)
 */
export function sanitizeShareText(text: string): string {
  return text
    .replace(/[^\w\s\-_.,!?@#$%&*()+=\[\]{}|\\:";'<>?/~`]/g, '') // Remove special chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Truncates text for sharing platforms with character limits
 */
export function truncateForSharing(text: string, maxLength: number = 1000): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - 3) + '...';
}

//export { shareViaWhatsApp, shareViaEmail, shareFile };