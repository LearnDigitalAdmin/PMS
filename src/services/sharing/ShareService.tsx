// ShareService.tsx - Updated with PDF Integration
import { Share } from '@capacitor/share';
import { Device } from '@capacitor/device';
import { Browser } from '@capacitor/browser';
import { formatCurrency, formatDate } from '../../utils/FormatUtils';
import { generateInvoicePDF, downloadPDF, generatePDFFilename } from '../pdf/PDFService';
import type { InvoiceWithDetails, Property, Payment } from '../database/Database';

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

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  website?: string;
}

/**
 * Normalizes Kenyan phone number to WhatsApp format (+254XXXXXXXXX)
 */
function normalizeKenyanPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '';
  
  // Remove all spaces, dashes, brackets, and other non-numeric characters except +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '');
  
  // Handle different formats
  if (cleaned.startsWith('+254')) {
    // Already in correct format
    return cleaned;
  } else if (cleaned.startsWith('254')) {
    // Add + prefix
    return '+' + cleaned;
  } else if (cleaned.startsWith('7') && cleaned.length === 9) {
    // Local format like 712312312
    return '+254' + cleaned;
  } else if (cleaned.length === 9) {
    // Assume it's a local number without country code
    return '+254' + cleaned;
  } else if (cleaned.length === 10 && cleaned.startsWith('0')) {
    // Format like 0712312312
    return '+254' + cleaned.substring(1);
  }
  
  // If we can't normalize it, return the cleaned version
  return cleaned.startsWith('+') ? cleaned : '+254' + cleaned;
}

/**
 * Shares invoice PDF via WhatsApp with formatted message
 */
export async function shareViaWhatsApp(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  _options: Partial<WhatsAppMessageOptions> = {}
): Promise<void> {
  try {
    // Generate PDF
    const pdfBytes = await generateInvoicePDF(invoice, property, payments, companyInfo);
    const filename = generatePDFFilename(invoice);
    const fileUri = await downloadPDF(pdfBytes, filename);
    
    // Normalize phone number to WhatsApp format
    const normalizedPhone = normalizeKenyanPhoneNumber(invoice.tenantPhone || '');
    
    // Generate caption message
    const caption = `Your invoice for ${invoice.billingMonth}`;
    const balanceDue = invoice.totalAmount - invoice.amountPaid;
    
    const message = `🏠 *RENT INVOICE - ${invoice.billingMonth.toUpperCase()}*

Dear ${invoice.tenantName},

Please find attached your rental invoice for ${property.name}.

📋 *Invoice #:* ${invoice.invoiceNumber}
💰 *Total Amount:* ${formatCurrency(invoice.totalAmount)}
💸 *Amount Paid:* ${formatCurrency(invoice.amountPaid)}
⚖️ *Balance Due:* ${formatCurrency(balanceDue)}
📅 *Due Date:* ${invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : 'N/A'}

${balanceDue > 0 ? '⚠️ Please make payment as soon as possible.' : '✅ Thank you! This invoice is paid in full.'}`;

    // Check device platform
    const deviceInfo = await Device.getInfo();
    
    if (deviceInfo.platform === 'web') {
      // For web, open WhatsApp Web with message only (can't send files)
      const whatsappUrl = normalizedPhone 
        ? `https://wa.me/${normalizedPhone.replace('+', '')}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      
      await Browser.open({ url: whatsappUrl });
    } else {
      // For mobile, share PDF with caption
      try {
        await Share.share({
          title: caption,
          text: message,
          url: fileUri,
          dialogTitle: 'Share Invoice via WhatsApp'
        });
      } catch (shareError) {
        // Fallback to WhatsApp URL if native sharing fails
        const whatsappUrl = normalizedPhone 
          ? `https://wa.me/${normalizedPhone.replace('+', '')}?text=${encodeURIComponent(message)}`
          : `https://wa.me/?text=${encodeURIComponent(message)}`;
        
        await Browser.open({ url: whatsappUrl });
      }
    }
  } catch (error) {
    console.error('WhatsApp sharing failed:', error);
    throw new Error('Failed to share invoice via WhatsApp. Please try again.');
  }
}

/**
 * Shares invoice PDF via email with professional formatting
 */
export async function shareViaEmail(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  options: Partial<EmailOptions> = {}
): Promise<void> {
  try {
    // Generate PDF
    const pdfBytes = await generateInvoicePDF(invoice, property, payments, companyInfo);
    const filename = generatePDFFilename(invoice);
    const fileUri = await downloadPDF(pdfBytes, filename);
    
    const subject = options.subject || `Your invoice for ${invoice.billingMonth} - ${property.name}`;
    const body = options.body || generateEmailBody(invoice, property);
    const to = options.to || (invoice.tenantEmail ? [invoice.tenantEmail] : []);
    
    // Check device capability
    const deviceInfo = await Device.getInfo();
    
    if (deviceInfo.platform === 'web') {
      // For web, construct mailto URL (can't attach files)
      const emailUrl = constructEmailUrl({
        to,
        subject,
        body: body + '\n\nNote: Please find the PDF invoice attached separately.',
        isHtml: options.isHtml || false
      });
      
      window.location.href = emailUrl;
    } else {
      // For mobile, share PDF with email details
      try {
        await Share.share({
          title: subject,
          text: body,
          url: fileUri,
          dialogTitle: 'Share Invoice via Email'
        });
      } catch (shareError) {
        // Fallback to email URL
        const emailUrl = constructEmailUrl({
          to,
          subject,
          body: body,
          isHtml: options.isHtml || false
        });
        
        await Browser.open({ url: emailUrl });
      }
    }
  } catch (error) {
    console.error('Email sharing failed:', error);
    throw new Error('Failed to share invoice via email. Please try again.');
  }
}

/**
 * Shares invoice PDF via generic file sharing
 */
export async function shareInvoicePDF(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  options: ShareOptions = {}
): Promise<void> {
  try {
    // Generate PDF
    const pdfBytes = await generateInvoicePDF(invoice, property, payments, companyInfo);
    const filename = generatePDFFilename(invoice);
    const fileUri = await downloadPDF(pdfBytes, filename);
    
    const caption = `Your invoice for ${invoice.billingMonth}`;
    
    await Share.share({
      title: options.subject || caption,
      text: options.text || `Invoice ${invoice.invoiceNumber} for ${property.name}`,
      url: fileUri,
      dialogTitle: options.dialogTitle || 'Share Invoice'
    });
  } catch (error) {
    console.error('PDF sharing failed:', error);
    throw new Error('Failed to share invoice PDF. Please try again.');
  }
}

/**
 * Shares payment reminder with PDF attachment
 */
export async function sharePaymentReminder(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  daysOverdue: number = 0
): Promise<void> {
  try {
    // Generate PDF
    const pdfBytes = await generateInvoicePDF(invoice, property, payments, companyInfo);
    const filename = generatePDFFilename(invoice);
    const fileUri = await downloadPDF(pdfBytes, filename);
    
    const message = generatePaymentReminderMessage(invoice, property, daysOverdue);
    const urgencyLevel = daysOverdue > 30 ? 'URGENT' : daysOverdue > 7 ? 'IMPORTANT' : 'FRIENDLY';
    
    await Share.share({
      title: `${urgencyLevel} Payment Reminder`,
      text: message,
      url: fileUri,
      dialogTitle: 'Send Payment Reminder'
    });
  } catch (error) {
    console.error('Payment reminder sharing failed:', error);
    throw new Error('Failed to share payment reminder. Please try again.');
  }
}

/**
 * Bulk share multiple invoice PDFs
 */
export async function shareBulkInvoicePDFs(
  invoices: InvoiceWithDetails[],
  properties: Property[],
  payments: Payment[][],
  companyInfo: CompanyInfo,
  options: ShareOptions = {}
): Promise<void> {
  try {
    // For bulk sharing, we'll create a summary text and let user know PDFs are available separately
    // Note: Most platforms don't support multiple file attachments in a single share
    const summary = generateBulkInvoiceSummary(invoices, properties);
    
    await Share.share({
      title: options.subject || `${invoices.length} Invoices Summary`,
      text: summary + '\n\nNote: Individual invoice PDFs can be shared separately from the app.',
      dialogTitle: options.dialogTitle || 'Share Invoices Summary'
    });
    
    // Optionally, you could generate and share the first invoice as an example
    if (invoices.length > 0) {
      const firstInvoice = invoices[0];
      const firstProperty = properties.find(p => p.id === firstInvoice.propertyId);
      const firstPayments = payments[0] || [];
      
      if (firstProperty) {
        const pdfBytes = await generateInvoicePDF(firstInvoice, firstProperty, firstPayments, companyInfo);
        const filename = `Sample_${generatePDFFilename(firstInvoice)}`;
        await downloadPDF(pdfBytes, filename);
      }
    }
  } catch (error) {
    console.error('Bulk invoice sharing failed:', error);
    throw new Error('Failed to share bulk invoices. Please try again.');
  }
}

// Keep the existing utility and message generator functions
function generateEmailBody(invoice: InvoiceWithDetails, property: Property): string {
  const dueDate = invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : 'N/A';
  const balanceDue = invoice.totalAmount - invoice.amountPaid;

  return `Dear ${invoice.tenantName},

I hope this email finds you well. Please find attached your rental invoice for ${property.name}.

INVOICE DETAILS
===============
Invoice Number: ${invoice.invoiceNumber}
Billing Period: ${invoice.billingMonth}
Due Date: ${dueDate}

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

Please refer to the attached invoice for complete details.

Thank you for your attention to this matter.`;
}

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

export function sanitizeShareText(text: string): string {
  return text
    .replace(/[^\w\s\-_.,!?@#$%&*()+=\[\]{}|\\:";'<>?/~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateForSharing(text: string, maxLength: number = 1000): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - 3) + '...';
}

// Legacy function for backward compatibility - now shares text summary
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

// Generic file sharing function (kept for backward compatibility)
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