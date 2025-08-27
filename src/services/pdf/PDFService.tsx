// PDFService.tsx - Enhanced Professional PDF Invoice Generation
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { formatCurrency, formatDate } from '../../utils/FormatUtils';
import type { InvoiceWithDetails, Property, Payment } from '../database/Database';
import cogvanaMessages from '../../assets/cogvana.json';

export interface PDFGenerationOptions {
  includeCompanyLogo?: boolean;
  template?: 'standard' | 'premium';
  watermark?: string;
  customHeader?: string;
  paymentInstructions?: string;
}

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  website?: string;
}

export interface CogvanaMessage {
  id: string;
  category: string;
  title: string;
  message: string;
  cta: string;
  color: string;
  icon: string;
}

// Enhanced layout constants for better spacing
const LAYOUT = {
  MARGIN: 50,
  LINE_HEIGHT: 15,
  SECTION_SPACING: 30,
  TABLE_ROW_HEIGHT: 25,
  HEADER_HEIGHT: 120,
  FOOTER_HEIGHT: 150,
  CARD_PADDING: 15,
  BORDER_RADIUS: 5 // Simulated with rectangles
};

const COLORS = {
  PRIMARY: rgb(0.2, 0.4, 0.8),
  SECONDARY: rgb(0.31, 0.27, 0.9),
  ACCENT: rgb(0.1, 0.7, 0.3),
  DARK: rgb(0.1, 0.1, 0.1),
  LIGHT_GRAY: rgb(0.9, 0.9, 0.9),
  MEDIUM_GRAY: rgb(0.6, 0.6, 0.6),
  BORDER: rgb(0.8, 0.8, 0.8),
  SUCCESS: rgb(0.2, 0.7, 0.2),
  DANGER: rgb(0.8, 0.2, 0.2),
  WHITE: rgb(1, 1, 1)
};

// Comprehensive emoji and special character sanitization
function sanitizeTextForPDF(text: string): string {
  if (!text) return '';
  
  return text
    // Remove all emoji ranges
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map Symbols
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Regional Indicator Symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
    .replace(/[\u{1F018}-\u{1F270}]/gu, '') // Various symbols
    .replace(/[\u{238C}-\u{2454}]/gu, '')   // Misc symbols
    .replace(/[\u{20D0}-\u{20FF}]/gu, '')   // Combining marks
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
    .replace(/[\u{E000}-\u{F8FF}]/gu, '')   // Private Use Area
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Enhanced Cogvana message with complete sanitization
function getRandomCogvanaMessage(): CogvanaMessage {
  const messages = cogvanaMessages.messages;
  const randomIndex = Math.floor(Math.random() * messages.length);
  const originalMessage = messages[randomIndex];
  
  // Return sanitized version
  return {
    ...originalMessage,
    title: sanitizeTextForPDF(originalMessage.title),
    message: sanitizeTextForPDF(originalMessage.message),
    cta: sanitizeTextForPDF(originalMessage.cta),
    icon: sanitizeTextForPDF(originalMessage.icon)
  };
}

// Convert hex color to RGB values for pdf-lib
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ];
  }
  return [0.31, 0.27, 0.9]; // Default Cogvana blue
}

// Enhanced header with modern card design
async function drawEnhancedHeader(
  page: any,
  font: any,
  boldFont: any,
  companyInfo: CompanyInfo,
  _options: PDFGenerationOptions,
  width: number
): Promise<number> {
  const yStart = 792; // A4 height - top margin
  
  // Header background card
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yStart - LAYOUT.HEADER_HEIGHT,
    width: width - (LAYOUT.MARGIN * 2),
    height: LAYOUT.HEADER_HEIGHT - 20,
    color: COLORS.LIGHT_GRAY,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  // Company name with enhanced styling
  page.drawText(companyInfo.name.toUpperCase(), {
    x: LAYOUT.MARGIN + 20,
    y: yStart - 40,
    size: 24,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Subtitle
  page.drawText('RENTAL MANAGEMENT SERVICES', {
    x: LAYOUT.MARGIN + 20,
    y: yStart - 62,
    size: 11,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  // Contact information in structured format with fallback for emojis
  let contactY = yStart - 85;
  
  if (companyInfo.address) {
    page.drawText('Address: ' + companyInfo.address, {
      x: LAYOUT.MARGIN + 20,
      y: contactY,
      size: 10,
      font: font,
      color: COLORS.DARK
    });
    contactY -= 15;
  }
  
  // Contact details in two columns
  const rightColumnX = width - 280;
  let rightContactY = yStart - 85;
  
  if (companyInfo.phone) {
    page.drawText('Tel: ' + companyInfo.phone, {
      x: LAYOUT.MARGIN + 20,
      y: contactY,
      size: 10,
      font: font,
      color: COLORS.DARK
    });
  }
  
  if (companyInfo.email) {
    page.drawText('Email: ' + companyInfo.email, {
      x: rightColumnX,
      y: rightContactY,
      size: 10,
      font: font,
      color: COLORS.DARK
    });
    rightContactY -= 15;
  }
  
  if (companyInfo.website) {
    page.drawText('Web: ' + companyInfo.website, {
      x: rightColumnX,
      y: rightContactY,
      size: 10,
      font: font,
      color: COLORS.DARK
    });
  }
  
  return yStart - LAYOUT.HEADER_HEIGHT - 20;
}

// Enhanced invoice title section with status badge
async function drawEnhancedInvoiceTitle(
  page: any,
  font: any,
  boldFont: any,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  // Title card background
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yPosition - 80,
    width: width - (LAYOUT.MARGIN * 2),
    height: 75,
    color: COLORS.WHITE,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  // INVOICE title with modern styling
  page.drawText('RENTAL INVOICE', {
    x: LAYOUT.MARGIN + 20,
    y: yPosition - 30,
    size: 28,
    font: boldFont,
    color: COLORS.DARK
  });
  
  // Status badge
  const isPaid = invoice.totalAmount <= invoice.amountPaid;
  const statusColor = isPaid ? COLORS.SUCCESS : COLORS.DANGER;
  const statusText = isPaid ? 'PAID' : 'PENDING';
  
  page.drawRectangle({
    x: LAYOUT.MARGIN + 20,
    y: yPosition - 55,
    width: 60,
    height: 18,
    color: statusColor
  });
  
  page.drawText(statusText, {
    x: LAYOUT.MARGIN + 30,
    y: yPosition - 50,
    size: 10,
    font: boldFont,
    color: COLORS.WHITE
  });
  
  // Invoice details in a structured card on the right
  const detailsX = width - 220;
  
  page.drawRectangle({
    x: detailsX - 10,
    y: yPosition - 75,
    width: 180,
    height: 70,
    color: COLORS.LIGHT_GRAY,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  const invoiceDate = formatDate(new Date(invoice.createdAt));
  const dueDate = invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : 'N/A';
  
  // Invoice details with labels
  page.drawText('Invoice Number', {
    x: detailsX,
    y: yPosition - 20,
    size: 9,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  page.drawText(invoice.invoiceNumber, {
    x: detailsX,
    y: yPosition - 33,
    size: 12,
    font: boldFont,
    color: COLORS.DARK
  });
  
  page.drawText('Date Issued', {
    x: detailsX,
    y: yPosition - 50,
    size: 9,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  page.drawText(invoiceDate, {
    x: detailsX,
    y: yPosition - 63,
    size: 10,
    font: font,
    color: COLORS.DARK
  });
  
  page.drawText('Due Date', {
    x: detailsX + 90,
    y: yPosition - 50,
    size: 9,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  page.drawText(dueDate, {
    x: detailsX + 90,
    y: yPosition - 63,
    size: 10,
    font: font,
    color: COLORS.DARK
  });
  
  return yPosition - 100;
}

// Enhanced property and tenant info with modern card layout
async function drawEnhancedPropertyTenantInfo(
  page: any,
  font: any,
  boldFont: any,
  property: Property,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  const cardHeight = 120;
  const cardWidth = (width - (LAYOUT.MARGIN * 2) - 20) / 2;
  
  // Property info card
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yPosition - cardHeight,
    width: cardWidth,
    height: cardHeight,
    color: COLORS.WHITE,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  // Property header with text instead of emoji
  page.drawText('PROPERTY DETAILS', {
    x: LAYOUT.MARGIN + LAYOUT.CARD_PADDING,
    y: yPosition - 25,
    size: 12,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Property details
  let propertyY = yPosition - 50;
  
  page.drawText(property.name, {
    x: LAYOUT.MARGIN + LAYOUT.CARD_PADDING,
    y: propertyY,
    size: 14,
    font: boldFont,
    color: COLORS.DARK
  });
  
  if (property.address) {
    propertyY -= 18;
    
    // Wrap long addresses
    const maxLineLength = 35;
    const addressLines = property.address.match(new RegExp(`.{1,${maxLineLength}}(\\s|$)`, 'g')) || [property.address];
    
    addressLines.forEach(line => {
      page.drawText(line.trim(), {
        x: LAYOUT.MARGIN + LAYOUT.CARD_PADDING,
        y: propertyY,
        size: 10,
        font: font,
        color: COLORS.MEDIUM_GRAY
      });
      propertyY -= 12;
    });
  }
  
  // Tenant info card
  const tenantCardX = LAYOUT.MARGIN + cardWidth + 20;
  
  page.drawRectangle({
    x: tenantCardX,
    y: yPosition - cardHeight,
    width: cardWidth,
    height: cardHeight,
    color: COLORS.WHITE,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  // Tenant header with text instead of emoji
  page.drawText('TENANT DETAILS', {
    x: tenantCardX + LAYOUT.CARD_PADDING,
    y: yPosition - 25,
    size: 12,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Tenant details
  let tenantY = yPosition - 50;
  
  page.drawText(invoice.tenantName, {
    x: tenantCardX + LAYOUT.CARD_PADDING,
    y: tenantY,
    size: 14,
    font: boldFont,
    color: COLORS.DARK
  });
  
  if (invoice.tenantPhone) {
    tenantY -= 18;
    page.drawText('Phone: ' + invoice.tenantPhone, {
      x: tenantCardX + LAYOUT.CARD_PADDING,
      y: tenantY,
      size: 10,
      font: font,
      color: COLORS.MEDIUM_GRAY
    });
  }
  
  if (invoice.tenantEmail) {
    tenantY -= 15;
    page.drawText('Email: ' + invoice.tenantEmail, {
      x: tenantCardX + LAYOUT.CARD_PADDING,
      y: tenantY,
      size: 10,
      font: font,
      color: COLORS.MEDIUM_GRAY
    });
  }
  
  return yPosition - cardHeight - LAYOUT.SECTION_SPACING;
}

// Enhanced billing table with modern design
async function drawEnhancedBillingTable(
  page: any,
  font: any,
  boldFont: any,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  // Table title
  page.drawText('BILLING DETAILS', {
    x: LAYOUT.MARGIN,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: COLORS.DARK
  });
  
  yPosition -= 25;
  
  const tableWidth = width - (LAYOUT.MARGIN * 2);
  const rowHeight = 30;
  const headerHeight = 35;
  
  // Modern table header with gradient effect
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yPosition - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: COLORS.PRIMARY
  });
  
  // Table headers
  const headers = ['Description', 'Previous', 'Current', 'Units', 'Rate', 'Amount'];
  const columnWidths = [160, 70, 70, 60, 90, 95];
  let headerX = LAYOUT.MARGIN + 15;
  
  headers.forEach((header, index) => {
    page.drawText(header.toUpperCase(), {
      x: headerX,
      y: yPosition - 22,
      size: 10,
      font: boldFont,
      color: COLORS.WHITE
    });
    headerX += columnWidths[index];
  });
  
  let currentY = yPosition - headerHeight;
  let rowIndex = 0;
  
  // Helper function to draw table row
  const drawTableRow = (data: string[], isTotal = false) => {
    const rowColor = isTotal ? COLORS.LIGHT_GRAY : (rowIndex % 2 === 0 ? COLORS.WHITE : rgb(0.98, 0.98, 0.98));
    
    page.drawRectangle({
      x: LAYOUT.MARGIN,
      y: currentY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: rowColor,
      borderColor: COLORS.BORDER,
      borderWidth: 0.5
    });
    
    let cellX = LAYOUT.MARGIN + 15;
    data.forEach((cellData, index) => {
      const textColor = isTotal ? COLORS.DARK : (index === data.length - 1 ? COLORS.PRIMARY : COLORS.DARK);
      const textFont = isTotal || index === data.length - 1 ? boldFont : font;
      
      page.drawText(cellData, {
        x: cellX,
        y: currentY - 18,
        size: 10,
        font: textFont,
        color: textColor
      });
      cellX += columnWidths[index];
    });
    
    currentY -= rowHeight;
    rowIndex++;
  };
  
  // Rent row
  drawTableRow([
    'Monthly Rent',
    '-',
    '-',
    '1',
    formatCurrency(invoice.rentAmount),
    formatCurrency(invoice.rentAmount)
  ]);
  
  // Water row (if applicable)
  if (invoice.waterCurrentReading > 0 || invoice.waterPreviousReading > 0) {
    const waterUnits = invoice.waterCurrentReading - invoice.waterPreviousReading;
    const waterAmount = waterUnits * invoice.waterUnitPrice + invoice.waterStandingFee;
    
    drawTableRow([
      'Water Usage + Standing Fee',
      invoice.waterPreviousReading.toString(),
      invoice.waterCurrentReading.toString(),
      waterUnits.toString(),
      formatCurrency(invoice.waterUnitPrice),
      formatCurrency(waterAmount)
    ]);
  }
  
  // Power row (if applicable)
  if (invoice.powerCurrentReading > 0 || invoice.powerPreviousReading > 0) {
    const powerUnits = invoice.powerCurrentReading - invoice.powerPreviousReading;
    const powerAmount = powerUnits * invoice.powerUnitPrice;
    
    drawTableRow([
      'Electricity Usage',
      invoice.powerPreviousReading.toString(),
      invoice.powerCurrentReading.toString(),
      powerUnits.toString(),
      formatCurrency(invoice.powerUnitPrice),
      formatCurrency(powerAmount)
    ]);
  }
  
  // Other charges (if applicable)
  if (invoice.otherCharges > 0) {
    const description = invoice.otherChargesDescription || 'Other Charges';
    drawTableRow([
      description,
      '-',
      '-',
      '-',
      '-',
      formatCurrency(invoice.otherCharges)
    ]);
  }
  
  return currentY - 20;
}

// Enhanced payments table with better styling
async function drawEnhancedPaymentsTable(
  page: any,
  font: any,
  boldFont: any,
  payments: Payment[],
  yPosition: number,
  width: number
): Promise<number> {
  // Payments section title without emoji
  page.drawText('PAYMENT HISTORY', {
    x: LAYOUT.MARGIN,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: COLORS.DARK
  });
  
  yPosition -= 25;
  
  const tableWidth = width - (LAYOUT.MARGIN * 2);
  const rowHeight = 25;
  const headerHeight = 30;
  
  // Table header
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yPosition - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: COLORS.ACCENT
  });
  
  const headers = ['Date', 'Amount', 'Method', 'Reference/Notes'];
  const columnWidths = [100, 100, 100, 245];
  let headerX = LAYOUT.MARGIN + 15;
  
  headers.forEach(header => {
    page.drawText(header.toUpperCase(), {
      x: headerX,
      y: yPosition - 20,
      size: 10,
      font: boldFont,
      color: COLORS.WHITE
    });
    headerX += columnWidths[headers.indexOf(header)];
  });
  
  let currentY = yPosition - headerHeight;
  
  payments.forEach((payment, index) => {
    const rowColor = index % 2 === 0 ? COLORS.WHITE : rgb(0.98, 0.98, 0.98);
    
    page.drawRectangle({
      x: LAYOUT.MARGIN,
      y: currentY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: rowColor,
      borderColor: COLORS.BORDER,
      borderWidth: 0.5
    });
    
    let cellX = LAYOUT.MARGIN + 15;
    
    // Payment data
    const paymentData = [
      formatDate(new Date(payment.paymentDate)),
      formatCurrency(payment.amount),
      payment.paymentMethod || 'N/A',
      payment.notes || ''
    ];
    
    paymentData.forEach(data => {
      page.drawText(data, {
        x: cellX,
        y: currentY - 15,
        size: 9,
        font: font,
        color: COLORS.DARK
      });
      cellX += columnWidths[paymentData.indexOf(data)];
    });
    
    currentY -= rowHeight;
  });
  
  return currentY - 20;
}

// Enhanced summary with modern card design
async function drawEnhancedSummary(
  page: any,
  font: any,
  boldFont: any,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  const summaryWidth = 280;
  const summaryHeight = 140;
  const summaryX = width - summaryWidth - LAYOUT.MARGIN;
  
  // Summary card with shadow effect
  page.drawRectangle({
    x: summaryX + 3,
    y: yPosition - summaryHeight - 3,
    width: summaryWidth,
    height: summaryHeight,
    color: rgb(0.85, 0.85, 0.85)
  });
  
  page.drawRectangle({
    x: summaryX,
    y: yPosition - summaryHeight,
    width: summaryWidth,
    height: summaryHeight,
    color: COLORS.WHITE,
    borderColor: COLORS.BORDER,
    borderWidth: 2
  });
  
  // Summary header
  page.drawText('INVOICE SUMMARY', {
    x: summaryX + 20,
    y: yPosition - 25,
    size: 12,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Summary items with better spacing
  const items = [
    { label: 'Subtotal:', value: formatCurrency(invoice.totalAmount), color: COLORS.DARK },
    { label: 'Amount Paid:', value: formatCurrency(invoice.amountPaid), color: COLORS.ACCENT },
    { label: 'Balance Due:', value: formatCurrency(invoice.totalAmount - invoice.amountPaid), 
      color: invoice.totalAmount - invoice.amountPaid > 0 ? COLORS.DANGER : COLORS.SUCCESS }
  ];
  
  if (invoice.arrears > 0) {
    items.splice(2, 0, { 
      label: 'Previous Arrears:', 
      value: formatCurrency(invoice.arrears), 
      color: COLORS.DANGER 
    });
  }
  
  let summaryY = yPosition - 50;
  
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const fontSize = isLast ? 14 : 11;
    const itemFont = isLast ? boldFont : font;
    
    page.drawText(item.label, {
      x: summaryX + 20,
      y: summaryY,
      size: fontSize,
      font: itemFont,
      color: COLORS.DARK
    });
    
    page.drawText(item.value, {
      x: summaryX + 150,
      y: summaryY,
      size: fontSize,
      font: boldFont,
      color: item.color
    });
    
    if (isLast) {
      // Draw line above final total
      page.drawLine({
        start: { x: summaryX + 20, y: summaryY + 5 },
        end: { x: summaryX + 260, y: summaryY + 5 },
        thickness: 1,
        color: COLORS.PRIMARY
      });
    }
    
    summaryY -= isLast ? 25 : 18;
  });
  
  return yPosition - summaryHeight - 30;
}

// Enhanced Cogvana banner with complete emoji sanitization
async function drawEnhancedCogvanaBanner(
  page: any,
  font: any,
  boldFont: any,
  yPosition: number,
  width: number
): Promise<void> {
  const cogvanaMsg = getRandomCogvanaMessage();
  const [r, g, b] = hexToRgb(cogvanaMsg.color);
  const bannerHeight = 70;
  const bannerY = yPosition;
  
  // Helper function to remove all emojis and special Unicode characters
  const sanitizeText = sanitizeTextForPDF;
  
  // Modern gradient background
  const gradientSteps = 5;
  for (let i = 0; i < gradientSteps; i++) {
    const alpha = 0.05 + (i * 0.03);
    const stepHeight = bannerHeight / gradientSteps;
    
    page.drawRectangle({
      x: LAYOUT.MARGIN,
      y: bannerY - (i + 1) * stepHeight,
      width: width - (LAYOUT.MARGIN * 2),
      height: stepHeight,
      color: rgb(r * alpha + 0.98 * (1 - alpha), 
                 g * alpha + 0.98 * (1 - alpha), 
                 b * alpha + 0.98 * (1 - alpha))
    });
  }
  
  // Modern border with rounded effect simulation
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: bannerY - bannerHeight,
    width: width - (LAYOUT.MARGIN * 2),
    height: bannerHeight,
    borderColor: rgb(r, g, b),
    borderWidth: 2
  });
  
  // Cogvana branding section
  page.drawText('COGVANA', {
    x: LAYOUT.MARGIN + 20,
    y: bannerY - 25,
    size: 16,
    font: boldFont,
    color: rgb(r, g, b)
  });
  
  page.drawText('Education Platform', {
    x: LAYOUT.MARGIN + 20,
    y: bannerY - 40,
    size: 9,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  // Message content with complete emoji sanitization
  const contentX = LAYOUT.MARGIN + 150;
  
  // Sanitize all text content
  const cleanTitle = sanitizeText(cogvanaMsg.title);
  const cleanMessage = sanitizeText(cogvanaMsg.message);
  const cleanCta = sanitizeText(cogvanaMsg.cta);
  
  // Category-based prefix instead of emoji
  const categoryPrefix = {
    'tutors': '[TUTORS]',
    'creators': '[CREATORS]',
    'students': '[STUDENTS]',
    'general': '[INFO]'
  }[cogvanaMsg.category] || '[COGVANA]';
  
  page.drawText(`${categoryPrefix} ${cleanTitle}`, {
    x: contentX,
    y: bannerY - 25,
    size: 12,
    font: boldFont,
    color: COLORS.DARK
  });
  
  // Message description with safe text wrapping
  const maxMessageWidth = width - contentX - 120;
  const messageWords = cleanMessage.split(' ').filter(word => word.length > 0);
  let messageLine = '';
  let messageY = bannerY - 40;
  
  messageWords.forEach(word => {
    const testLine = messageLine + word + ' ';
    if (testLine.length * 5 < maxMessageWidth) {
      messageLine = testLine;
    } else {
      if (messageLine.trim()) {
        page.drawText(messageLine.trim(), {
          x: contentX,
          y: messageY,
          size: 9,
          font: font,
          color: COLORS.MEDIUM_GRAY
        });
        messageY -= 12;
      }
      messageLine = word + ' ';
    }
  });
  
  if (messageLine.trim()) {
    page.drawText(messageLine.trim(), {
      x: contentX,
      y: messageY,
      size: 9,
      font: font,
      color: COLORS.MEDIUM_GRAY
    });
  }
  
  // Call to action with safe text handling
  const ctaText = cleanCta ? `>> ${cleanCta}` : '>> Learn More';
  
  page.drawText(ctaText, {
    x: contentX,
    y: bannerY - 60,
    size: 10,
    font: boldFont,
    color: rgb(r, g, b)
  });
  
  // Contact information aligned to right
  const contactText = cogvanaMsg.category === 'tutors' || cogvanaMsg.category === 'creators' 
    ? 'tutors@cogvana.com | cogvana.com/tutors'
    : 'cogvana.com | Download on Play Store';
    
  page.drawText(contactText, {
    x: width - 250,
    y: bannerY - 60,
    size: 8,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
}

// Enhanced footer with proper spacing
async function drawEnhancedFooter(
  page: any,
  font: any,
  boldFont: any,
  _companyInfo: CompanyInfo,
  options: PDFGenerationOptions,
  yPosition: number,
  width: number
): Promise<void> {
  let currentY = yPosition;
  
  // Payment instructions section
  const instructions = options.paymentInstructions || 
    'Payment should be made within 7 days of the due date. Late payments may incur additional charges. Please include your invoice number in payment references.';
  
  page.drawText('💳 PAYMENT INSTRUCTIONS', {
    x: LAYOUT.MARGIN,
    y: currentY,
    size: 11,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  currentY -= 20;
  
  // Wrap payment instructions properly
  const maxWidth = width - (LAYOUT.MARGIN * 2);
  const words = instructions.split(' ');
  let line = '';
  
  words.forEach(word => {
    const testLine = line + word + ' ';
    if (testLine.length * 5 < maxWidth) {
      line = testLine;
    } else {
      if (line) {
        page.drawText(line.trim(), {
          x: LAYOUT.MARGIN,
          y: currentY,
          size: 10,
          font: font,
          color: COLORS.DARK
        });
        currentY -= 14;
      }
      line = word + ' ';
    }
  });
  
  if (line.trim()) {
    page.drawText(line.trim(), {
      x: LAYOUT.MARGIN,
      y: currentY,
      size: 10,
      font: font,
      color: COLORS.DARK
    });
  }
  
  currentY -= 25;
  
  // Add Cogvana promotional section
  await drawEnhancedCogvanaBanner(page, font, boldFont, currentY, width);
  
  currentY -= 85;
  
  // Footer separator line
  page.drawLine({
    start: { x: LAYOUT.MARGIN, y: currentY },
    end: { x: width - LAYOUT.MARGIN, y: currentY },
    thickness: 1,
    color: COLORS.BORDER
  });
  
  currentY -= 20;
  
  // Thank you message with modern styling (no emojis)
  page.drawText('Thank you for your business!', {
    x: (width / 2) - 90,
    y: currentY,
    size: 14,
    font: boldFont,
    color: COLORS.PRIMARY
  });
}

// Enhanced watermark with better positioning
async function addEnhancedWatermark(
  page: any,
  font: any,
  width: number,
  height: number
): Promise<void> {
  // Main watermark
  page.drawText('GENERATED BY PLOT YANGU FROM SMB KENYA', {
    x: width / 2 - 140,
    y: height / 2 - 100,
    size: 16,
    font: font,
    color: rgb(0.92, 0.92, 0.92),
    rotate: { type: 'degrees', angle: -45 }
  });
  
  // Subtle Cogvana watermark
  page.drawText('Powered by Cogvana Education Platform', {
    x: width / 2 - 100,
    y: height / 2 - 130,
    size: 12,
    font: font,
    color: rgb(0.96, 0.96, 0.96),
    rotate: { type: 'degrees', angle: -45 }
  });
}

// Main enhanced PDF generation function with input sanitization
async function generateEnhancedInvoicePDF(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  options: PDFGenerationOptions = {}
): Promise<Uint8Array> {
  try {
    // Sanitize all text inputs before processing
    const sanitizedInvoice = {
      ...invoice,
      tenantName: sanitizeTextForPDF(invoice.tenantName),
      tenantEmail: sanitizeTextForPDF(invoice.tenantEmail || ''),
      tenantPhone: sanitizeTextForPDF(invoice.tenantPhone || ''),
      otherChargesDescription: sanitizeTextForPDF(invoice.otherChargesDescription || '')
    };
    
    const sanitizedProperty = {
      ...property,
      name: sanitizeTextForPDF(property.name),
      address: sanitizeTextForPDF(property.address || '')
    };
    
    const sanitizedCompanyInfo = {
      ...companyInfo,
      name: sanitizeTextForPDF(companyInfo.name),
      address: sanitizeTextForPDF(companyInfo.address || ''),
      phone: sanitizeTextForPDF(companyInfo.phone || ''),
      email: sanitizeTextForPDF(companyInfo.email || ''),
      website: sanitizeTextForPDF(companyInfo.website || '')
    };
    
    const sanitizedPayments = payments.map(payment => ({
      ...payment,
      paymentMethod: sanitizeTextForPDF(payment.paymentMethod || ''),
      notes: sanitizeTextForPDF(payment.notes || '')
    }));
    
    const sanitizedOptions = {
      ...options,
      paymentInstructions: sanitizeTextForPDF(options.paymentInstructions || ''),
      customHeader: sanitizeTextForPDF(options.customHeader || ''),
      watermark: sanitizeTextForPDF(options.watermark || '')
    };
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Calculate if we need multiple pages
    let yPosition = height - LAYOUT.MARGIN;
    
    // Draw enhanced header
    yPosition = await drawEnhancedHeader(page, font, boldFont, sanitizedCompanyInfo, sanitizedOptions, width);
    
    // Draw enhanced invoice title and details
    yPosition = await drawEnhancedInvoiceTitle(page, font, boldFont, sanitizedInvoice, yPosition, width);
    
    // Check if we need a new page for content
    if (yPosition < 400) {
      const newPage = pdfDoc.addPage([595, 842]);
      yPosition = height - LAYOUT.MARGIN;
      
      // Continue on new page
      yPosition = await drawEnhancedPropertyTenantInfo(newPage, font, boldFont, sanitizedProperty, sanitizedInvoice, yPosition, width);
      yPosition = await drawEnhancedBillingTable(newPage, font, boldFont, sanitizedInvoice, yPosition, width);
      
      if (sanitizedPayments.length > 0) {
        yPosition = await drawEnhancedPaymentsTable(newPage, font, boldFont, sanitizedPayments, yPosition, width);
      }
      
      yPosition = await drawEnhancedSummary(newPage, font, boldFont, sanitizedInvoice, yPosition, width);
      
      // Draw enhanced footer
      await drawEnhancedFooter(newPage, font, boldFont, sanitizedCompanyInfo, sanitizedOptions, Math.max(yPosition, 200), width);
      
      // Add watermark for free version
      if (sanitizedOptions.template !== 'premium') {
        await addEnhancedWatermark(newPage, font, width, height);
      }
    } else {
      // Everything fits on one page
      yPosition = await drawEnhancedPropertyTenantInfo(page, font, boldFont, sanitizedProperty, sanitizedInvoice, yPosition, width);
      yPosition = await drawEnhancedBillingTable(page, font, boldFont, sanitizedInvoice, yPosition, width);
      
      if (sanitizedPayments.length > 0 && yPosition > 300) {
        yPosition = await drawEnhancedPaymentsTable(page, font, boldFont, sanitizedPayments, yPosition, width);
      }
      
      yPosition = await drawEnhancedSummary(page, font, boldFont, sanitizedInvoice, yPosition, width);
      
      // Draw enhanced footer
      await drawEnhancedFooter(page, font, boldFont, sanitizedCompanyInfo, sanitizedOptions, Math.max(yPosition, 200), width);
      
      // Add watermark for free version
      if (sanitizedOptions.template !== 'premium') {
        await addEnhancedWatermark(page, font, width, height);
      }
    }
    
    return await pdfDoc.save();
  } catch (error) {
    console.error('Enhanced PDF generation failed:', error);
    throw new Error('Failed to generate enhanced PDF invoice. Please try again.');
  }
}

// Keep original function for backward compatibility but use enhanced version
// async function generateInvoicePDF(
//   invoice: InvoiceWithDetails,
//   property: Property,
//   payments: Payment[] = [],
//   companyInfo: CompanyInfo,
//   options: PDFGenerationOptions = {}
// ): Promise<Uint8Array> {
//   return generateEnhancedInvoicePDF(invoice, property, payments, companyInfo, options);
// }

// Enhanced download function with better error handling
async function downloadEnhancedPDF(
  pdfBytes: Uint8Array,
  filename: string
): Promise<string> {
  try {
    // Convert to base64 with improved chunking
    let binary = '';
    const chunkSize = 0x8000;
    
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const base64Data = btoa(binary);

    // Create invoices directory with better error handling
    try {
      await Filesystem.mkdir({
        path: 'PlotYangu/invoices',
        directory: Directory.External,
        recursive: true,
      });
      console.log('PlotYangu invoices directory created successfully');
    } catch (dirError: any) {
      if (!dirError.message?.includes('already exists')) {
        console.warn('Directory creation warning:', dirError.message);
      }
    }

    // Try to save to organized folder structure
    const targetPath = `PlotYangu/invoices/${filename}`;
    
    try {
      const result = await Filesystem.writeFile({
        path: targetPath,
        data: base64Data,
        directory: Directory.External,
      });
      
      console.log('Enhanced PDF saved successfully:', result.uri);
      return result.uri;
    } catch (subfolderError) {
      console.warn('Subfolder save failed, trying Downloads root:', subfolderError);
      
      // Fallback to Downloads root
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.External,
      });
      
      console.log('PDF saved to Downloads root:', result.uri);
      return result.uri;
    }

  } catch (error) {
    console.error('Enhanced PDF download failed:', error);
    return await downloadPDFWithFallback(pdfBytes, filename);
  }
}

// Enhanced PDF sharing with better user experience
export async function shareEnhancedPDF(
  pdfBytes: Uint8Array,
  filename: string,
  title: string = 'Professional Invoice'
): Promise<void> {
  try {
    const fileUri = await downloadEnhancedPDF(pdfBytes, filename);
    
    await Share.share({
      title: title,
      text: `${title} - Generated by Plot Yangu`,
      url: fileUri,
      dialogTitle: 'Share Your Invoice'
    });
  } catch (error) {
    console.error('Enhanced PDF sharing failed:', error);
    throw new Error('Failed to share PDF invoice. Please check permissions and try again.');
  }
}

// Enhanced filename generation with better formatting
export function generateEnhancedPDFFilename(invoice: InvoiceWithDetails): string {
  const sanitizedTenant = invoice.tenantName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const month = invoice.billingMonth.replace(/-/g, '_');
  const timestamp = new Date().toISOString().slice(0, 10);
  
  return `PlotYangu_Invoice_${invoice.invoiceNumber}_${sanitizedTenant}_${month}_${timestamp}.pdf`;
}

// Utility function to validate invoice data before PDF generation
export function validateInvoiceData(invoice: InvoiceWithDetails, property: Property): boolean {
  const requiredFields = [
    invoice.invoiceNumber,
    invoice.tenantName,
    invoice.totalAmount,
    property.name
  ];
  
  return requiredFields.every(field => field !== null && field !== undefined && field !== '');
}

// Enhanced error handling wrapper
export async function generatePDFWithErrorHandling(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  options: PDFGenerationOptions = {}
): Promise<Uint8Array> {
  // Validate input data
  if (!validateInvoiceData(invoice, property)) {
    throw new Error('Invalid invoice data. Please ensure all required fields are filled.');
  }
  
  // Validate company info
  if (!companyInfo.name) {
    throw new Error('Company name is required for PDF generation.');
  }
  
  try {
    return await generateEnhancedInvoicePDF(invoice, property, payments, companyInfo, options);
  } catch (error) {
    console.error('PDF generation error:', error);
    
    // Provide specific error messages
    if (error instanceof Error) {
      if (error.message.includes('font')) {
        throw new Error('Font loading failed. Please try again.');
      } else if (error.message.includes('memory')) {
        throw new Error('Insufficient memory for PDF generation. Please close other apps and try again.');
      }
    }
    
    throw new Error('PDF generation failed. Please check your data and try again.');
  }
}

// Fallback approach - try multiple accessible directories with enhanced error handling
async function downloadPDFWithFallback(
  pdfBytes: Uint8Array,
  filename: string
): Promise<string> {
  const directories = [
    { dir: Directory.External, name: 'Downloads', path: '' },
    { dir: Directory.Cache, name: 'Cache', path: 'PlotYangu/' },
    { dir: Directory.Documents, name: 'Documents', path: 'PlotYangu/' }
  ];
  
  for (const { dir, name, path } of directories) {
    try {
      console.log(`Attempting to save enhanced PDF to ${name} directory`);
      
      // Create directory if path is specified
      if (path) {
        try {
          await Filesystem.mkdir({
            path: path.slice(0, -1), // Remove trailing slash
            directory: dir,
            recursive: true,
          });
        } catch (dirError: any) {
          if (!dirError.message?.includes('already exists')) {
            console.warn(`Directory creation failed for ${name}:`, dirError.message);
          }
        }
      }
      
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        const chunk = pdfBytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Data = btoa(binary);

      const result = await Filesystem.writeFile({
        path: path + filename,
        data: base64Data,
        directory: dir,
      });

      console.log(`Enhanced PDF saved successfully to ${name}:`, result.uri);
      return result.uri;
    } catch (error: any) {
      console.warn(`Failed to save to ${name}:`, error.message || error);
      continue;
    }
  }
  
  throw new Error('Failed to save enhanced PDF to any available directory. Please check storage permissions and available space.');
}

/**
 * Enhanced PDF sharing with better error handling and user feedback
 */
export async function sharePDF(
  pdfBytes: Uint8Array,
  filename: string,
  title: string = 'Professional Invoice'
): Promise<void> {
  return shareEnhancedPDF(pdfBytes, filename, title);
}

/**
 * Enhanced filename generation (backward compatibility)
 */
export function generatePDFFilename(invoice: InvoiceWithDetails): string {
  return generateEnhancedPDFFilename(invoice);
}

// Export enhanced functions as main functions
export { 
  generateEnhancedInvoicePDF as generateInvoicePDF, 
  downloadEnhancedPDF as downloadPDF,
  // generatePDFWithErrorHandling,
  // validateInvoiceData,
  LAYOUT,
  COLORS
};