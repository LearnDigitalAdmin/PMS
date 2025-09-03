// PDFService.tsx - Enhanced Professional PDF Invoice Generation - Layout Fixed
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { formatCurrency, formatDate } from '../../utils/FormatUtils';
import type { InvoiceWithDetails, Property, Payment, User } from '../database/Database';
import cogvanaMessages from '../../assets/cogvana.json';




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
    // Remove specific problematic characters
    .replace(/[💳📧📞🏢🏠👤💰📝💡📊⚡💧]/g, '') // Common emojis
    .replace(/[→←↑↓]/g, '') // Arrows
    .replace(/[•◦‣⁃]/g, '*') // Replace bullet points with asterisk
    .replace(/[""'']/g, '"') // Replace smart quotes
    .replace(/[–—]/g, '-') // Replace em/en dashes
    .replace(/[…]/g, '...') // Replace ellipsis
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

// Fixed header with proper positioning
async function drawEnhancedHeader(
  page: any,
  font: any,
  boldFont: any,
  companyInfo: CompanyInfo,
  _options: PDFGenerationOptions,
  width: number
): Promise<number> {
  const yStart = 842 - LAYOUT.TOP_MARGIN; // A4 height with proper top margin
  
  // Header background card
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yStart - LAYOUT.HEADER_HEIGHT,
    width: width - (LAYOUT.MARGIN * 2),
    height: LAYOUT.HEADER_HEIGHT - 10,
    color: COLORS.LIGHT_GRAY,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  // Company name with enhanced styling
  page.drawText(sanitizeTextForPDF(companyInfo.name.toUpperCase()), {
    x: LAYOUT.MARGIN + 15,
    y: yStart - 30,
    size: 22,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Subtitle
  page.drawText('RENTAL MANAGEMENT SERVICES', {
    x: LAYOUT.MARGIN + 15,
    y: yStart - 50,
    size: 10,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  // Contact information in structured format
  let contactY = yStart - 70;
  
  if (companyInfo.address) {
    page.drawText('Address: ' + sanitizeTextForPDF(companyInfo.address), {
      x: LAYOUT.MARGIN + 15,
      y: contactY,
      size: 9,
      font: font,
      color: COLORS.DARK
    });
    contactY -= 12;
  }
  
  // Contact details in two columns
  const rightColumnX = width - 250;
  let rightContactY = yStart - 70;
  
  if (companyInfo.phone) {
    page.drawText('Tel: ' + sanitizeTextForPDF(companyInfo.phone), {
      x: LAYOUT.MARGIN + 15,
      y: contactY,
      size: 9,
      font: font,
      color: COLORS.DARK
    });
  }
  
  if (companyInfo.email) {
    page.drawText('Email: ' + sanitizeTextForPDF(companyInfo.email), {
      x: rightColumnX,
      y: rightContactY,
      size: 9,
      font: font,
      color: COLORS.DARK
    });
    rightContactY -= 12;
  }
  
  if (companyInfo.website) {
    page.drawText('Web: ' + sanitizeTextForPDF(companyInfo.website), {
      x: rightColumnX,
      y: rightContactY,
      size: 9,
      font: font,
      color: COLORS.DARK
    });
  }
  
  return yStart - LAYOUT.HEADER_HEIGHT - 15;
}

// Enhanced invoice title section with proper spacing
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
    y: yPosition - 70,
    width: width - (LAYOUT.MARGIN * 2),
    height: 65,
    color: COLORS.WHITE,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  // INVOICE title with modern styling
  page.drawText('RENTAL INVOICE', {
    x: LAYOUT.MARGIN + 15,
    y: yPosition - 25,
    size: 24,
    font: boldFont,
    color: COLORS.DARK
  });
  
  // Status badge
  const isPaid = invoice.totalAmount <= invoice.amountPaid;
  const statusColor = isPaid ? COLORS.SUCCESS : COLORS.DANGER;
  const statusText = isPaid ? 'PAID' : 'PENDING';
  
  page.drawRectangle({
    x: LAYOUT.MARGIN + 15,
    y: yPosition - 48,
    width: 55,
    height: 16,
    color: statusColor
  });
  
  page.drawText(statusText, {
    x: LAYOUT.MARGIN + 22,
    y: yPosition - 44,
    size: 9,
    font: boldFont,
    color: COLORS.WHITE
  });
  
  // Invoice details in a structured card on the right
  const detailsX = width - 200;
  
  page.drawRectangle({
    x: detailsX - 10,
    y: yPosition - 65,
    width: 170,
    height: 60,
    color: COLORS.LIGHT_GRAY,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  const invoiceDate = formatDate(new Date(invoice.createdAt));
  const dueDate = invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : 'N/A';
  
  // Invoice details with labels
  page.drawText('Invoice Number', {
    x: detailsX,
    y: yPosition - 18,
    size: 8,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  page.drawText(sanitizeTextForPDF(invoice.invoiceNumber), {
    x: detailsX,
    y: yPosition - 30,
    size: 11,
    font: boldFont,
    color: COLORS.DARK
  });
  
  page.drawText('Date Issued', {
    x: detailsX,
    y: yPosition - 45,
    size: 8,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  page.drawText(invoiceDate, {
    x: detailsX,
    y: yPosition - 57,
    size: 9,
    font: font,
    color: COLORS.DARK
  });
  
  page.drawText('Due Date', {
    x: detailsX + 80,
    y: yPosition - 45,
    size: 8,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  page.drawText(dueDate, {
    x: detailsX + 80,
    y: yPosition - 57,
    size: 9,
    font: font,
    color: COLORS.DARK
  });
  
  return yPosition - 80;
}

// Enhanced property and tenant info with proper card sizing
async function drawEnhancedPropertyTenantInfo(
  page: any,
  font: any,
  boldFont: any,
  property: Property,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  const cardHeight = 100;
  const cardWidth = (width - (LAYOUT.MARGIN * 2) - 15) / 2;
  
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
  
  // Property header
  page.drawText('PROPERTY DETAILS', {
    x: LAYOUT.MARGIN + LAYOUT.CARD_PADDING,
    y: yPosition - 20,
    size: 11,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Property details
  let propertyY = yPosition - 40;
  
  page.drawText(sanitizeTextForPDF(property.name), {
    x: LAYOUT.MARGIN + LAYOUT.CARD_PADDING,
    y: propertyY,
    size: 12,
    font: boldFont,
    color: COLORS.DARK
  });
  
  if (property.address) {
    propertyY -= 15;
    
    // Wrap long addresses
    const maxLineLength = 32;
    const addressLines = sanitizeTextForPDF(property.address).match(new RegExp(`.{1,${maxLineLength}}(\\s|$)`, 'g')) || [sanitizeTextForPDF(property.address)];
    
    addressLines.forEach(line => {
      page.drawText(line.trim(), {
        x: LAYOUT.MARGIN + LAYOUT.CARD_PADDING,
        y: propertyY,
        size: 9,
        font: font,
        color: COLORS.MEDIUM_GRAY
      });
      propertyY -= 11;
    });
  }
  
  // Tenant info card
  const tenantCardX = LAYOUT.MARGIN + cardWidth + 15;
  
  page.drawRectangle({
    x: tenantCardX,
    y: yPosition - cardHeight,
    width: cardWidth,
    height: cardHeight,
    color: COLORS.WHITE,
    borderColor: COLORS.BORDER,
    borderWidth: 1
  });
  
  // Tenant header
  page.drawText('TENANT DETAILS', {
    x: tenantCardX + LAYOUT.CARD_PADDING,
    y: yPosition - 20,
    size: 11,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Tenant details
  let tenantY = yPosition - 40;
  
  page.drawText(sanitizeTextForPDF(invoice.tenantName), {
    x: tenantCardX + LAYOUT.CARD_PADDING,
    y: tenantY,
    size: 12,
    font: boldFont,
    color: COLORS.DARK
  });
  
  if (invoice.tenantPhone) {
    tenantY -= 15;
    page.drawText('Phone: ' + sanitizeTextForPDF(invoice.tenantPhone), {
      x: tenantCardX + LAYOUT.CARD_PADDING,
      y: tenantY,
      size: 9,
      font: font,
      color: COLORS.MEDIUM_GRAY
    });
  }
  
  if (invoice.tenantEmail) {
    tenantY -= 12;
    page.drawText('Email: ' + sanitizeTextForPDF(invoice.tenantEmail), {
      x: tenantCardX + LAYOUT.CARD_PADDING,
      y: tenantY,
      size: 9,
      font: font,
      color: COLORS.MEDIUM_GRAY
    });
  }
  
  return yPosition - cardHeight - LAYOUT.SECTION_SPACING;
}

// Fixed billing table with proper column widths
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
    size: 12,
    font: boldFont,
    color: COLORS.DARK
  });
  
  yPosition -= 20;
  
  const tableWidth = width - (LAYOUT.MARGIN * 2);
  const rowHeight = LAYOUT.TABLE_ROW_HEIGHT;
  const headerHeight = 28;
  
  // Fixed column widths that fit within table
  const columnWidths = [140, 65, 65, 50, 80, 85]; // Total: 485 (fits in ~515 available width)
  
  // Modern table header
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yPosition - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: COLORS.PRIMARY
  });
  
  // Table headers
  const headers = ['Description', 'Previous', 'Current', 'Units', 'Rate', 'Amount'];
  let headerX = LAYOUT.MARGIN + 10;
  
  headers.forEach((header, index) => {
    page.drawText(header.toUpperCase(), {
      x: headerX,
      y: yPosition - 18,
      size: 9,
      font: boldFont,
      color: COLORS.WHITE
    });
    headerX += columnWidths[index];
  });
  
  let currentY = yPosition - headerHeight;
  let rowIndex = 0;
  
  // Helper function to draw table row with proper text alignment
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
    
    let cellX = LAYOUT.MARGIN + 10;
    data.forEach((cellData, index) => {
      const textColor = isTotal ? COLORS.DARK : (index === data.length - 1 ? COLORS.PRIMARY : COLORS.DARK);
      const textFont = isTotal || index === data.length - 1 ? boldFont : font;
      
      // Truncate text if it's too long for the column
      let displayText = sanitizeTextForPDF(cellData);
      const maxChars = Math.floor(columnWidths[index] / 6); // Approximate character width
      if (displayText.length > maxChars) {
        displayText = displayText.substring(0, maxChars - 3) + '...';
      }
      
      page.drawText(displayText, {
        x: cellX,
        y: currentY - 15,
        size: 9,
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
      'Water + Standing Fee',
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
    const description = sanitizeTextForPDF(invoice.otherChargesDescription || 'Other Charges');
    drawTableRow([
      description,
      '-',
      '-',
      '-',
      '-',
      formatCurrency(invoice.otherCharges)
    ]);
  }
  
  return currentY - 15;
}

// Enhanced payments table with proper sizing
async function drawEnhancedPaymentsTable(
  page: any,
  font: any,
  boldFont: any,
  payments: Payment[],
  yPosition: number,
  width: number
): Promise<number> {
  // Payments section title
  page.drawText('PAYMENT HISTORY', {
    x: LAYOUT.MARGIN,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: COLORS.DARK
  });
  
  yPosition -= 20;
  
  const tableWidth = width - (LAYOUT.MARGIN * 2);
  const rowHeight = 20;
  const headerHeight = 25;
  
  // Fixed column widths for payments table
  const columnWidths = [90, 90, 90, 245]; // Total fits within table width
  
  // Table header
  page.drawRectangle({
    x: LAYOUT.MARGIN,
    y: yPosition - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: COLORS.ACCENT
  });
  
  const headers = ['Date', 'Amount', 'Method', 'Reference/Notes'];
  let headerX = LAYOUT.MARGIN + 10;
  
  headers.forEach(header => {
    page.drawText(header.toUpperCase(), {
      x: headerX,
      y: yPosition - 16,
      size: 9,
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
    
    let cellX = LAYOUT.MARGIN + 10;
    
    // Payment data
    const paymentData = [
      formatDate(new Date(payment.paymentDate)),
      formatCurrency(payment.amount),
      sanitizeTextForPDF(payment.paymentMethod || 'N/A'),
      sanitizeTextForPDF(payment.notes || '')
    ];
    
    paymentData.forEach((data, colIndex) => {
      // Truncate text if too long
      let displayText = data;
      const maxChars = Math.floor(columnWidths[colIndex] / 5);
      if (displayText.length > maxChars) {
        displayText = displayText.substring(0, maxChars - 3) + '...';
      }
      
      page.drawText(displayText, {
        x: cellX,
        y: currentY - 13,
        size: 8,
        font: font,
        color: COLORS.DARK
      });
      cellX += columnWidths[colIndex];
    });
    
    currentY -= rowHeight;
  });
  
  return currentY - 15;
}

// Fixed summary positioning to avoid overlap - FIXED LINE ISSUE
async function drawEnhancedSummary(
  page: any,
  font: any,
  boldFont: any,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  const summaryWidth = 260;
  const summaryHeight = 120;
  const summaryX = width - summaryWidth - LAYOUT.MARGIN;
  
  // Ensure summary doesn't overlap with other content
  const minY = Math.max(yPosition - summaryHeight, 150); // Minimum Y position
  const adjustedY = Math.min(yPosition, minY + summaryHeight);
  
  // Summary card with shadow effect
  page.drawRectangle({
    x: summaryX + 2,
    y: adjustedY - summaryHeight - 2,
    width: summaryWidth,
    height: summaryHeight,
    color: rgb(0.85, 0.85, 0.85)
  });
  
  page.drawRectangle({
    x: summaryX,
    y: adjustedY - summaryHeight,
    width: summaryWidth,
    height: summaryHeight,
    color: COLORS.WHITE,
    borderColor: COLORS.BORDER,
    borderWidth: 2
  });
  
  // Summary header
  page.drawText('INVOICE SUMMARY', {
    x: summaryX + 15,
    y: adjustedY - 20,
    size: 11,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  // Summary items with proper spacing
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
  
  let summaryY = adjustedY - 40;
  
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const fontSize = isLast ? 12 : 10;
    const itemFont = isLast ? boldFont : font;
    
    page.drawText(item.label, {
      x: summaryX + 15,
      y: summaryY,
      size: fontSize,
      font: itemFont,
      color: COLORS.DARK
    });
    
    page.drawText(item.value, {
      x: summaryX + 140,
      y: summaryY,
      size: fontSize,
      font: boldFont,
      color: item.color
    });
    
    if (isLast) {
      // Draw line above final total - FIXED POSITIONING
      page.drawLine({
        start: { x: summaryX + 15, y: summaryY + 8 }, // Moved line higher to avoid cutting through text
        end: { x: summaryX + 240, y: summaryY + 8 },
        thickness: 1,
        color: COLORS.PRIMARY
      });
    }
    
    summaryY -= isLast ? 20 : 15;
  });
  
  return adjustedY - summaryHeight - 20;
}

// UPDATED Cogvana banner - only shows for free and basic users
async function drawEnhancedCogvanaBanner(
  page: any,
  font: any,
  boldFont: any,
  yPosition: number,
  width: number,
  userTier: string
): Promise<number> {
  // Hide Cogvana section for business and enterprise users
  if (userTier === 'business' || userTier === 'pro' || userTier === 'enterprise') {
    return yPosition; // Return same position, no banner drawn
  }
  
  const cogvanaMsg = getRandomCogvanaMessage();
  const [r, g, b] = hexToRgb(cogvanaMsg.color);
  const bannerHeight = 60;
  const bannerY = yPosition;
  
  // Modern gradient background
  const gradientSteps = 4;
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
  
  // Modern border
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
    x: LAYOUT.MARGIN + 15,
    y: bannerY - 18,
    size: 14,
    font: boldFont,
    color: rgb(r, g, b)
  });
  
  page.drawText('Education Platform', {
    x: LAYOUT.MARGIN + 15,
    y: bannerY - 32,
    size: 8,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  // Message content with complete emoji sanitization
  const contentX = LAYOUT.MARGIN + 130;
  
  // Category-based prefix instead of emoji
  const categoryPrefix = {
    'tutors': '[TUTORS]',
    'creators': '[CREATORS]',
    'students': '[STUDENTS]',
    'general': '[INFO]'
  }[cogvanaMsg.category] || '[COGVANA]';
  
  page.drawText(`${categoryPrefix} ${cogvanaMsg.title}`, {
    x: contentX,
    y: bannerY - 18,
    size: 10,
    font: boldFont,
    color: COLORS.DARK
  });
  
  // Message description with safe text wrapping
  const maxMessageWidth = width - contentX - 100;
  const messageWords = cogvanaMsg.message.split(' ').filter(word => word.length > 0);
  let messageLine = '';
  let messageY = bannerY - 32;
  
  messageWords.forEach(word => {
    const testLine = messageLine + word + ' ';
    if (testLine.length * 4.5 < maxMessageWidth) {
      messageLine = testLine;
    } else {
      if (messageLine.trim()) {
        page.drawText(messageLine.trim(), {
          x: contentX,
          y: messageY,
          size: 8,
          font: font,
          color: COLORS.MEDIUM_GRAY
        });
        messageY -= 10;
      }
      messageLine = word + ' ';
    }
  });
  
  if (messageLine.trim()) {
    page.drawText(messageLine.trim(), {
      x: contentX,
      y: messageY,
      size: 8,
      font: font,
      color: COLORS.MEDIUM_GRAY
    });
  }
  
  // Call to action with safe text handling
  const ctaText = cogvanaMsg.cta ? `>> ${cogvanaMsg.cta}` : '>> Learn More';
  
  page.drawText(ctaText, {
    x: contentX,
    y: bannerY - 50,
    size: 9,
    font: boldFont,
    color: rgb(r, g, b)
  });
  
  // Contact information aligned to right
  const contactText = cogvanaMsg.category === 'tutors' || cogvanaMsg.category === 'creators' 
    ? 'tutors@cogvana.com | cogvana.com/tutors'
    : 'cogvana.com | Download on Play Store';
    
  page.drawText(contactText, {
    x: width - 220,
    y: bannerY - 50,
    size: 7,
    font: font,
    color: COLORS.MEDIUM_GRAY
  });
  
  return bannerY - bannerHeight - 10; // Return new Y position after banner
}





































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

// Fixed layout constants for proper A4 spacing
const LAYOUT = {
  MARGIN: 40,
  LINE_HEIGHT: 15,
  SECTION_SPACING: 25,
  TABLE_ROW_HEIGHT: 22,
  HEADER_HEIGHT: 100,
  FOOTER_HEIGHT: 120,
  CARD_PADDING: 12,
  BORDER_RADIUS: 5,
  TOP_MARGIN: 40, // Reduced from excessive margin
  COGVANA_SPACING: 35 // Proper spacing between Cogvana and invoice data
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

// Enhanced footer with proper spacing and no overlap
async function drawEnhancedFooter(
  page: any,
  font: any,
  boldFont: any,
  _companyInfo: CompanyInfo,
  options: PDFGenerationOptions,
  yPosition: number,
  width: number,
  user: User | null
): Promise<void> {
  // Ensure footer doesn't go below page boundaries
  let currentY = Math.max(yPosition, 180);
  
  // Payment instructions section
  const instructions = sanitizeTextForPDF(options.paymentInstructions || 
    'Payment should be made within 7 days of the due date. Late payments may incur additional charges. Please include your invoice number in payment references.');
  
  page.drawText('PAYMENT INSTRUCTIONS', {
    x: LAYOUT.MARGIN,
    y: currentY,
    size: 10,
    font: boldFont,
    color: COLORS.PRIMARY
  });
  
  currentY -= 15;
  
  // Wrap payment instructions properly
  const maxWidth = width - (LAYOUT.MARGIN * 2);
  const words = instructions.split(' ');
  let line = '';
  
  words.forEach(word => {
    const testLine = line + word + ' ';
    if (testLine.length * 4.5 < maxWidth) {
      line = testLine;
    } else {
      if (line) {
        page.drawText(line.trim(), {
          x: LAYOUT.MARGIN,
          y: currentY,
          size: 9,
          font: font,
          color: COLORS.DARK
        });
        currentY -= 12;
      }
      line = word + ' ';
    }
  });
  
  if (line.trim()) {
    page.drawText(line.trim(), {
      x: LAYOUT.MARGIN,
      y: currentY,
      size: 9,
      font: font,
      color: COLORS.DARK
    });
  }
  
  currentY -= LAYOUT.COGVANA_SPACING; // Proper spacing before Cogvana banner
  
  // Add Cogvana promotional section with proper positioning
  currentY = await drawEnhancedCogvanaBanner(page, font, boldFont, currentY, width, user ? user.tier : 'free');
  
  // Footer separator line
  page.drawLine({
    start: { x: LAYOUT.MARGIN, y: currentY - 5 },
    end: { x: width - LAYOUT.MARGIN, y: currentY - 5 },
    thickness: 1,
    color: COLORS.BORDER
  });
  
  currentY -= 20;
  
  // Thank you message with modern styling (no emojis)
  page.drawText('Thank you for your business!', {
    x: (width / 2) - 80,
    y: currentY,
    size: 12,
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

// Main enhanced PDF generation function with proper layout management
async function generateEnhancedInvoicePDF(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  options: PDFGenerationOptions = {},
  user: any
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
    const page = pdfDoc.addPage([595, 842]); // Standard A4 size
    const { width, height } = page.getSize();
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Start with proper top margin
    let yPosition = height - LAYOUT.TOP_MARGIN;
    
    // Draw enhanced header
    yPosition = await drawEnhancedHeader(page, font, boldFont, sanitizedCompanyInfo, sanitizedOptions, width);
    
    // Draw enhanced invoice title and details
    yPosition = await drawEnhancedInvoiceTitle(page, font, boldFont, sanitizedInvoice, yPosition, width);
    
    // Check if we need a new page for content
    const requiredSpaceForContent = 350; // Estimate space needed for remaining content
    
    if (yPosition < requiredSpaceForContent) {
      const newPage = pdfDoc.addPage([595, 842]);
      yPosition = height - LAYOUT.TOP_MARGIN;
      
      // Continue on new page with proper spacing
      yPosition = await drawEnhancedPropertyTenantInfo(newPage, font, boldFont, sanitizedProperty, sanitizedInvoice, yPosition, width);
      yPosition = await drawEnhancedBillingTable(newPage, font, boldFont, sanitizedInvoice, yPosition, width);
      
      if (sanitizedPayments.length > 0 && yPosition > 200) {
        yPosition = await drawEnhancedPaymentsTable(newPage, font, boldFont, sanitizedPayments, yPosition, width);
      }
      
      // Draw summary with proper positioning to avoid overlap
      const summaryY = Math.max(yPosition, 250);
      yPosition = await drawEnhancedSummary(newPage, font, boldFont, sanitizedInvoice, summaryY, width);
      
      // Draw enhanced footer with proper spacing
      await drawEnhancedFooter(newPage, font, boldFont, sanitizedCompanyInfo, sanitizedOptions, Math.max(yPosition, 200), width, user);
      
      // Add watermark for free version
      if (sanitizedOptions.template !== 'premium') {
        await addEnhancedWatermark(newPage, font, width, height);
      }
    } else {
      // Everything fits on one page with proper spacing
      yPosition = await drawEnhancedPropertyTenantInfo(page, font, boldFont, sanitizedProperty, sanitizedInvoice, yPosition, width);
      yPosition = await drawEnhancedBillingTable(page, font, boldFont, sanitizedInvoice, yPosition, width);
      
      if (sanitizedPayments.length > 0 && yPosition > 250) {
        yPosition = await drawEnhancedPaymentsTable(page, font, boldFont, sanitizedPayments, yPosition, width);
      }
      
      // Ensure summary doesn't overlap with other content
      const summaryY = Math.max(yPosition, 280);
      yPosition = await drawEnhancedSummary(page, font, boldFont, sanitizedInvoice, summaryY, width);
      
      // Draw enhanced footer with proper spacing
      await drawEnhancedFooter(page, font, boldFont, sanitizedCompanyInfo, sanitizedOptions, Math.max(yPosition, 220), width, user);
      
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

// Enhanced download function with better error handling
async function downloadEnhancedPDF(
  pdfBytes: Uint8Array,
  filename: string,
  _user: any
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
  title: string = 'Professional Invoice',
  user: any
): Promise<void> {
  try {
    const fileUri = await downloadEnhancedPDF(pdfBytes, filename, user);
    
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
  const sanitizedTenant = sanitizeTextForPDF(invoice.tenantName).replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const month = invoice.billingMonth.replace(/-/g, '_');
  const timestamp = new Date().toISOString().slice(0, 10);
  
  return `PlotYangu_Invoice_${sanitizeTextForPDF(invoice.invoiceNumber)}_${sanitizedTenant}_${month}_${timestamp}.pdf`;
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
  options: PDFGenerationOptions = {},
  user: any
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
    return await generateEnhancedInvoicePDF(invoice, property, payments, companyInfo, options, user);
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
  title: string = 'Professional Invoice',
  user: any
): Promise<void> {
  return shareEnhancedPDF(pdfBytes, filename, title, user);
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
  COLORS
};