// PDFService.tsx - Professional PDF Invoice Generation
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

// New function to get random Cogvana message
function getRandomCogvanaMessage(): CogvanaMessage {
  const messages = cogvanaMessages.messages;
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

// New function to convert hex color to RGB values for pdf-lib
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

// Updated drawFooter function with Cogvana integration
async function drawFooter(
  page: any,
  font: any,
  boldFont: any,
  _companyInfo: CompanyInfo,
  options: PDFGenerationOptions,
  yPosition: number,
  width: number
): Promise<void> {
  // Payment instructions (moved up)
  const instructions = options.paymentInstructions || 
    'Payment should be made within 7 days of the due date. Late payments may incur additional charges.';
  
  page.drawText('PAYMENT INSTRUCTIONS:', {
    x: 50,
    y: yPosition + 60,
    size: 10,
    font: font
  });
  
  const maxWidth = width - 100;
  const words = instructions.split(' ');
  let line = '';
  let lineY = yPosition + 45;
  
  words.forEach(word => {
    const testLine = line + word + ' ';
    if (testLine.length * 6 < maxWidth) {
      line = testLine;
    } else {
      page.drawText(line.trim(), {
        x: 50,
        y: lineY,
        size: 9,
        font: font,
        color: rgb(0.4, 0.4, 0.4)
      });
      line = word + ' ';
      lineY -= 12;
    }
  });
  
  if (line.trim()) {
    page.drawText(line.trim(), {
      x: 50,
      y: lineY,
      size: 9,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    });
  }

  // Add Cogvana promotional section
  await drawCogvanaBanner(page, font, boldFont, yPosition - 20, width);
  
  // Footer line (moved down)
  page.drawLine({
    start: { x: 50, y: yPosition - 80 },
    end: { x: width - 50, y: yPosition - 80 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8)
  });
  
  // Thank you message (moved down)
  page.drawText('Thank you for your business!', {
    x: (width / 2) - 80,
    y: yPosition - 95,
    size: 12,
    font: font,
    color: rgb(0.3, 0.3, 0.3)
  });
}

// New function to draw Cogvana promotional banner
async function drawCogvanaBanner(
  page: any,
  font: any,
  boldFont: any,
  yPosition: number,
  width: number
): Promise<void> {
  const cogvanaMsg = getRandomCogvanaMessage();
  const [r, g, b] = hexToRgb(cogvanaMsg.color);
  const bannerHeight = 55;
  const bannerY = yPosition;
  
  // Background gradient effect using multiple rectangles
  const gradientSteps = 3;
  for (let i = 0; i < gradientSteps; i++) {
    const alpha = 0.1 + (i * 0.05);
    const stepHeight = bannerHeight / gradientSteps;
    
    page.drawRectangle({
      x: 50,
      y: bannerY - (i + 1) * stepHeight,
      width: width - 100,
      height: stepHeight,
      color: rgb(r * alpha + 0.95 * (1 - alpha), 
                 g * alpha + 0.95 * (1 - alpha), 
                 b * alpha + 0.95 * (1 - alpha))
    });
  }
  
  // Border
  page.drawRectangle({
    x: 50,
    y: bannerY - bannerHeight,
    width: width - 100,
    height: bannerHeight,
    borderColor: rgb(r, g, b),
    borderWidth: 1.5
  });
  
  // Cogvana logo/brand name
  page.drawText('COGVANA', {
    x: 65,
    y: bannerY - 18,
    size: 14,
    font: boldFont,
    color: rgb(r, g, b)
  });
  
  // Icon (using Unicode emoji)
  page.drawText(cogvanaMsg.icon, {
    x: 140,
    y: bannerY - 18,
    size: 12,
    font: font
  });
  
  // Main message title
  page.drawText(cogvanaMsg.title, {
    x: 160,
    y: bannerY - 18,
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1)
  });
  
  // Message description
  page.drawText(cogvanaMsg.message, {
    x: 65,
    y: bannerY - 32,
    size: 9,
    font: font,
    color: rgb(0.3, 0.3, 0.3)
  });
  
  // Call to action
  page.drawText(` ${cogvanaMsg.cta}`, {
    x: 65,
    y: bannerY - 46,
    size: 9,
    font: boldFont,
    color: rgb(r, g, b)
  });
  
  // Contact info based on category
  const contactText = cogvanaMsg.category === 'tutors' || cogvanaMsg.category === 'creators' 
    ? 'tutors@cogvana.com | cogvana.com/tutors'
    : 'Download on Play Store | cogvana.com';
    
  page.drawText(contactText, {
    x: width - 280,
    y: bannerY - 46,
    size: 8,
    font: font,
    color: rgb(0.4, 0.4, 0.4)
  });
}

// Updated addWatermark function to include Cogvana subtly
async function addWatermark(
  page: any,
  font: any,
  width: number,
  height: number
): Promise<void> {
  // Original watermark (slightly moved)
  page.drawText('GENERATED BY PLOT YANGU FROM SMB KENYA', {
    x: width / 2 - 120,
    y: height / 2 - 180,
    size: 18,
    font: font,
    color: rgb(0.9, 0.9, 0.9),
    rotate: { type: 'degrees', angle: 0 }
  });
  
  // Subtle Cogvana watermark
  page.drawText('Powered by Cogvana Education Platform', {
    x: width / 2 - 90,
    y: height / 2 - 220,
    size: 12,
    font: font,
    color: rgb(0.95, 0.95, 0.95),
    rotate: { type: 'degrees', angle: 0 }
  });
}

// Updated generateInvoicePDF function signature and call
async function generateInvoicePDF(
  invoice: InvoiceWithDetails,
  property: Property,
  payments: Payment[] = [],
  companyInfo: CompanyInfo,
  options: PDFGenerationOptions = {}
): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let yPosition = height - 50;
    
    // Draw header
    yPosition = await drawHeader(page, font, boldFont, companyInfo, options, yPosition, width);
    
    // Draw invoice title and number
    yPosition = await drawInvoiceTitle(page, boldFont, invoice, yPosition, width);
    
    // Draw property and tenant info
    yPosition = await drawPropertyTenantInfo(page, font, boldFont, property, invoice, yPosition);
    
    // Draw billing details table
    yPosition = await drawBillingTable(page, font, boldFont, invoice, yPosition, width);
    
    // Draw payments table if any
    if (payments.length > 0) {
      yPosition = await drawPaymentsTable(page, font, boldFont, payments, yPosition, width);
    }
    
    // Draw summary
    yPosition = await drawSummary(page, font, boldFont, invoice, yPosition, width);
    
    // Draw footer with Cogvana integration (updated call)
    await drawFooter(page, font, boldFont, companyInfo, options, Math.max(yPosition, 130), width);
    
    // Add watermark for free version
    if (options.template !== 'premium') {
      await addWatermark(page, font, width, height);
    }
    
    return await pdfDoc.save();
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw new Error('Failed to generate PDF invoice. Please try again.');
  }
}











































/**
 * Generates a professional PDF invoice
 */
// async function generateInvoicePDF(
//   invoice: InvoiceWithDetails,
//   property: Property,
//   payments: Payment[] = [],
//   companyInfo: CompanyInfo,
//   options: PDFGenerationOptions = {}
// ): Promise<Uint8Array> {
//   try {
//     const pdfDoc = await PDFDocument.create();
//     const page = pdfDoc.addPage([595, 842]); // A4 size
//     const { width, height } = page.getSize();
    
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
//     let yPosition = height - 50;
    
//     // Draw header
//     yPosition = await drawHeader(page, font, boldFont, companyInfo, options, yPosition, width);
    
//     // Draw invoice title and number
//     yPosition = await drawInvoiceTitle(page, boldFont, invoice, yPosition, width);
    
//     // Draw property and tenant info
//     yPosition = await drawPropertyTenantInfo(page, font, boldFont, property, invoice, yPosition);
    
//     // Draw billing details table
//     yPosition = await drawBillingTable(page, font, boldFont, invoice, yPosition, width);
    
//     // Draw payments table if any
//     if (payments.length > 0) {
//       yPosition = await drawPaymentsTable(page, font, boldFont, payments, yPosition, width);
//     }
    
//     // Draw summary
//     yPosition = await drawSummary(page, font, boldFont, invoice, yPosition, width);
    
//     // Draw footer
//     await drawFooter(page, font, companyInfo, options, 50, width);
    
//     // Add watermark for free version
//     if (options.template !== 'premium') {
//       await addWatermark(page, font, width, height);
//     }
    
//     return await pdfDoc.save();
//   } catch (error) {
//     console.error('PDF generation failed:', error);
//     throw new Error('Failed to generate PDF invoice. Please try again.');
//   }
// }

async function drawHeader(
  page: any,
  font: any,
  boldFont: any,
  companyInfo: CompanyInfo,
  _options: PDFGenerationOptions,
  yPosition: number,
  width: number
): Promise<number> {
  // Company name
  page.drawText(companyInfo.name.toUpperCase(), {
    x: 50,
    y: yPosition,
    size: 20,
    font: boldFont,
    color: rgb(0.2, 0.4, 0.8)
  });
  
  yPosition -= 25;
  
  // Company details
  if (companyInfo.address) {
    page.drawText(companyInfo.address, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3)
    });
    yPosition -= 15;
  }
  
  const contactInfo = [];
  if (companyInfo.phone) contactInfo.push(`Tel: ${companyInfo.phone}`);
  if (companyInfo.email) contactInfo.push(`Email: ${companyInfo.email}`);
  if (companyInfo.website) contactInfo.push(`Web: ${companyInfo.website}`);
  
  if (contactInfo.length > 0) {
    page.drawText(contactInfo.join(' | '), {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3)
    });
    yPosition -= 15;
  }
  
  // Draw line separator
  page.drawLine({
    start: { x: 50, y: yPosition - 10 },
    end: { x: width - 50, y: yPosition - 10 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  });
  
  return yPosition - 30;
}

async function drawInvoiceTitle(
  page: any,
  boldFont: any,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  // INVOICE title
  page.drawText('RENTAL INVOICE', {
    x: 50,
    y: yPosition,
    size: 24,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1)
  });
  
  // Invoice details on the right
  const invoiceDate = formatDate(new Date(invoice.createdAt));
  const dueDate = invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : 'N/A';
  
  page.drawText(`Invoice #: ${invoice.invoiceNumber}`, {
    x: width - 200,
    y: yPosition,
    size: 12,
    font: boldFont
  });
  
  page.drawText(`Date: ${invoiceDate}`, {
    x: width - 200,
    y: yPosition - 20,
    size: 10,
    font: boldFont
  });
  
  page.drawText(`Due Date: ${dueDate}`, {
    x: width - 200,
    y: yPosition - 35,
    size: 10,
    font: boldFont
  });
  
  return yPosition - 70;
}

async function drawPropertyTenantInfo(
  page: any,
  font: any,
  boldFont: any,
  property: Property,
  invoice: InvoiceWithDetails,
  yPosition: number
): Promise<number> {
  // Property info (left column)
  page.drawText('PROPERTY DETAILS', {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont
  });
  
  yPosition -= 20;
  
  page.drawText(property.name, {
    x: 50,
    y: yPosition,
    size: 11,
    font: boldFont
  });
  
  if (property.address) {
    yPosition -= 15;
    page.drawText(property.address, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font
    });
  }
  
  // Tenant info (right column)
  const rightColumnX = 300;
  let rightYPosition = yPosition + 35;
  
  page.drawText('TENANT DETAILS', {
    x: rightColumnX,
    y: rightYPosition,
    size: 12,
    font: boldFont
  });
  
  rightYPosition -= 20;
  
  page.drawText(invoice.tenantName, {
    x: rightColumnX,
    y: rightYPosition,
    size: 11,
    font: boldFont
  });
  
  if (invoice.tenantPhone) {
    rightYPosition -= 15;
    page.drawText(`Phone: ${invoice.tenantPhone}`, {
      x: rightColumnX,
      y: rightYPosition,
      size: 10,
      font: font
    });
  }
  
  if (invoice.tenantEmail) {
    rightYPosition -= 15;
    page.drawText(`Email: ${invoice.tenantEmail}`, {
      x: rightColumnX,
      y: rightYPosition,
      size: 10,
      font: font
    });
  }
  
  return Math.min(yPosition, rightYPosition) - 30;
}

async function drawBillingTable(
  page: any,
  font: any,
  boldFont: any,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  const tableY = yPosition;
  const tableWidth = width - 100;
  const rowHeight = 25;
  
  // Table header
  page.drawRectangle({
    x: 50,
    y: tableY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: rgb(0.9, 0.9, 0.9)
  });
  
  // Header text
  const headers = ['Description', 'Previous', 'Current', 'Units', 'Rate', 'Amount'];
  const columnWidths = [140, 70, 70, 60, 90, 105];
  let headerX = 55;
  
  headers.forEach((header, index) => {
    page.drawText(header, {
      x: headerX,
      y: tableY - 17,
      size: 10,
      font: boldFont
    });
    headerX += columnWidths[index];
  });
  
  let currentY = tableY - rowHeight;
  
  // Rent row
  currentY -= rowHeight;
  page.drawLine({
    start: { x: 50, y: currentY },
    end: { x: width - 50, y: currentY },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8)
  });
  
  let cellX = 55;
  page.drawText('Monthly Rent', { x: cellX, y: currentY + 8, size: 10, font: font });
  cellX += columnWidths[0];
  page.drawText('-', { x: cellX, y: currentY + 8, size: 10, font: font });
  cellX += columnWidths[1];
  page.drawText('-', { x: cellX, y: currentY + 8, size: 10, font: font });
  cellX += columnWidths[2];
  page.drawText('1', { x: cellX, y: currentY + 8, size: 10, font: font });
  cellX += columnWidths[3];
  page.drawText(formatCurrency(invoice.rentAmount), { x: cellX, y: currentY + 8, size: 10, font: font });
  cellX += columnWidths[4];
  page.drawText(formatCurrency(invoice.rentAmount), { x: cellX, y: currentY + 8, size: 10, font: boldFont });
  
  // Water row (if applicable)
  if (invoice.waterCurrentReading > 0 || invoice.waterPreviousReading > 0) {
    currentY -= rowHeight;
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: width - 50, y: currentY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
    
    const waterUnits = invoice.waterCurrentReading - invoice.waterPreviousReading;
    const waterAmount = waterUnits * invoice.waterUnitPrice + invoice.waterStandingFee;
    
    cellX = 55;
    page.drawText('Water Usage', { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[0];
    page.drawText(invoice.waterPreviousReading.toString(), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[1];
    page.drawText(invoice.waterCurrentReading.toString(), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[2];
    page.drawText(waterUnits.toString(), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[3];
    page.drawText(formatCurrency(invoice.waterUnitPrice), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[4];
    page.drawText(formatCurrency(waterAmount), { x: cellX, y: currentY + 8, size: 10, font: boldFont });
  }
  
  // Power row (if applicable)
  if (invoice.powerCurrentReading > 0 || invoice.powerPreviousReading > 0) {
    currentY -= rowHeight;
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: width - 50, y: currentY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
    
    const powerUnits = invoice.powerCurrentReading - invoice.powerPreviousReading;
    const powerAmount = powerUnits * invoice.powerUnitPrice;
    
    cellX = 55;
    page.drawText('Electricity', { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[0];
    page.drawText(invoice.powerPreviousReading.toString(), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[1];
    page.drawText(invoice.powerCurrentReading.toString(), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[2];
    page.drawText(powerUnits.toString(), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[3];
    page.drawText(formatCurrency(invoice.powerUnitPrice), { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[4];
    page.drawText(formatCurrency(powerAmount), { x: cellX, y: currentY + 8, size: 10, font: boldFont });
  }
  
  // Other charges (if applicable)
  if (invoice.otherCharges > 0) {
    currentY -= rowHeight;
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: width - 50, y: currentY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
    
    cellX = 55;
    const description = invoice.otherChargesDescription || 'Other Charges';
    page.drawText(description, { x: cellX, y: currentY + 8, size: 10, font: font });
    cellX += columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4];
    page.drawText(formatCurrency(invoice.otherCharges), { x: cellX, y: currentY + 8, size: 10, font: boldFont });
  }
  
  // Table bottom border
  currentY -= 5;
  page.drawLine({
    start: { x: 50, y: currentY },
    end: { x: width - 50, y: currentY },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5)
  });
  
  return currentY - 20;
}

async function drawPaymentsTable(
  page: any,
  font: any,
  boldFont: any,
  payments: Payment[],
  yPosition: number,
  width: number
): Promise<number> {
  page.drawText('PAYMENT HISTORY', {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont
  });
  
  yPosition -= 30;
  
  const tableWidth = width - 100;
  const rowHeight = 20;
  
  // Table header
  page.drawRectangle({
    x: 50,
    y: yPosition - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: rgb(0.9, 0.9, 0.9)
  });
  
  const headers = ['Date', 'Amount', 'Method', 'Notes'];
  const columnWidths = [100, 100, 100, 235];
  let headerX = 55;
  
  headers.forEach((header, index) => {
    page.drawText(header, {
      x: headerX,
      y: yPosition - 14,
      size: 10,
      font: boldFont
    });
    headerX += columnWidths[index];
  });
  
  let currentY = yPosition - rowHeight;
  
  payments.forEach(payment => {
    currentY -= rowHeight;
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: width - 50, y: currentY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
    
    let cellX = 55;
    page.drawText(formatDate(new Date(payment.paymentDate)), { x: cellX, y: currentY + 6, size: 9, font: font });
    cellX += columnWidths[0];
    page.drawText(formatCurrency(payment.amount), { x: cellX, y: currentY + 6, size: 9, font: font });
    cellX += columnWidths[1];
    page.drawText(payment.paymentMethod || 'N/A', { x: cellX, y: currentY + 6, size: 9, font: font });
    cellX += columnWidths[2];
    page.drawText(payment.notes || '', { x: cellX, y: currentY + 6, size: 9, font: font });
  });
  
  return currentY - 20;
}

async function drawSummary(
  page: any,
  font: any,
  boldFont: any,
  invoice: InvoiceWithDetails,
  yPosition: number,
  width: number
): Promise<number> {
  const summaryX = width - 250;
  
  // Summary box
  page.drawRectangle({
    x: summaryX - 10,
    y: yPosition - 80,
    width: 200,
    height: 75,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 1
  });
  
  // Summary items
  page.drawText('Total Amount:', {
    x: summaryX,
    y: yPosition - 20,
    size: 11,
    font: font
  });
  page.drawText(formatCurrency(invoice.totalAmount), {
    x: summaryX + 100,
    y: yPosition - 20,
    size: 11,
    font: boldFont
  });
  
  page.drawText('Amount Paid:', {
    x: summaryX,
    y: yPosition - 35,
    size: 11,
    font: font
  });
  page.drawText(formatCurrency(invoice.amountPaid), {
    x: summaryX + 100,
    y: yPosition - 35,
    size: 11,
    font: font
  });
  
  page.drawText('Balance Due:', {
    x: summaryX,
    y: yPosition - 50,
    size: 12,
    font: boldFont,
    color: invoice.totalAmount - invoice.amountPaid > 0 ? rgb(0.8, 0.2, 0.2) : rgb(0.2, 0.7, 0.2)
  });
  page.drawText(formatCurrency(invoice.totalAmount - invoice.amountPaid), {
    x: summaryX + 100,
    y: yPosition - 50,
    size: 12,
    font: boldFont,
    color: invoice.totalAmount - invoice.amountPaid > 0 ? rgb(0.8, 0.2, 0.2) : rgb(0.2, 0.7, 0.2)
  });
  
  if (invoice.arrears > 0) {
    page.drawText('Previous Arrears:', {
      x: summaryX,
      y: yPosition - 65,
      size: 11,
      font: font,
      color: rgb(0.8, 0.2, 0.2)
    });
    page.drawText(formatCurrency(invoice.arrears), {
      x: summaryX + 100,
      y: yPosition - 65,
      size: 11,
      font: boldFont,
      color: rgb(0.8, 0.2, 0.2)
    });
  }
  
  return yPosition - 100;
}

// async function drawFooter(
//   page: any,
//   font: any,
//   _companyInfo: CompanyInfo,
//   options: PDFGenerationOptions,
//   yPosition: number,
//   width: number
// ): Promise<void> {
//   // Payment instructions
//   const instructions = options.paymentInstructions || 
//     'Payment should be made within 7 days of the due date. Late payments may incur additional charges.';
  
//   page.drawText('PAYMENT INSTRUCTIONS:', {
//     x: 50,
//     y: yPosition + 40,
//     size: 10,
//     font: font
//   });
  
//   const maxWidth = width - 100;
//   const words = instructions.split(' ');
//   let line = '';
//   let lineY = yPosition + 25;
  
//   words.forEach(word => {
//     const testLine = line + word + ' ';
//     if (testLine.length * 6 < maxWidth) {
//       line = testLine;
//     } else {
//       page.drawText(line.trim(), {
//         x: 50,
//         y: lineY,
//         size: 9,
//         font: font,
//         color: rgb(0.4, 0.4, 0.4)
//       });
//       line = word + ' ';
//       lineY -= 12;
//     }
//   });
  
//   if (line.trim()) {
//     page.drawText(line.trim(), {
//       x: 50,
//       y: lineY,
//       size: 9,
//       font: font,
//       color: rgb(0.4, 0.4, 0.4)
//     });
//   }
  
//   // Footer line
//   page.drawLine({
//     start: { x: 50, y: yPosition - 10 },
//     end: { x: width - 50, y: yPosition - 10 },
//     thickness: 0.5,
//     color: rgb(0.8, 0.8, 0.8)
//   });
  
//   // Thank you message
//   page.drawText('Thank you for your business!', {
//     x: (width / 2) - 80,
//     y: yPosition - 25,
//     size: 12,
//     font: font,
//     color: rgb(0.3, 0.3, 0.3)
//   });
// }

// async function addWatermark(
//   page: any,
//   font: any,
//   width: number,
//   height: number
// ): Promise<void> {
//   page.drawText('GENERATED BY PLOT YANGU FROM SMB KENYA', {
//     x: width / 2 - 100,
//     y: height / 2 - 200,
//     size: 20,
//     font: font,
//     color: rgb(0.9, 0.9, 0.9),
//     rotate: { type: 'degrees', angle: 0 }
//   });
// }

/**
 * Downloads the PDF to device storage
 */
async function downloadPDF(
  pdfBytes: Uint8Array,
  filename: string
): Promise<string> {
  try {
    // Convert to base64 properly
    let binary = '';
    const chunkSize = 0x8000; // avoid call stack overflow on large PDFs
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        pdfBytes.subarray(i, i + chunkSize) as any
      );
    }
    const base64Data = btoa(binary);

    // Use Downloads directory - much more accessible than Documents
    try {
      await Filesystem.mkdir({
        path: 'invoices',
        directory: Directory.External, // Downloads folder
        recursive: true,
      });
      console.log('Invoices directory created in Downloads');
    } catch (dirError: any) {
      if (dirError.message && !dirError.message.includes('already exists')) {
        console.warn('Failed to create invoices subdirectory, using Downloads root:', dirError);
      }
    }

    // Try writing to invoices subfolder first, fallback to Downloads root
    let targetPath = `invoices/${filename}`;
    let targetDirectory = Directory.External;
    
    try {
      const result = await Filesystem.writeFile({
        path: targetPath,
        data: base64Data,
        directory: targetDirectory,
      });
      console.log('PDF saved successfully to Downloads/invoices:', result.uri);
      return result.uri;
    } catch (subfolderError) {
      console.warn('Failed to write to invoices subfolder, trying Downloads root');
      // Fallback to Downloads root
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.External,
      });
      console.log('PDF saved successfully to Downloads root:', result.uri);
      return result.uri;
    }

  } catch (error) {
    console.error('PDF download to Downloads failed:', error);
    // Final fallback to other directories
    return await downloadPDFWithFallback(pdfBytes, filename);
  }
}

// Fallback approach - try multiple accessible directories
async function downloadPDFWithFallback(
  pdfBytes: Uint8Array,
  filename: string
): Promise<string> {
  // Try directories in order of preference: Downloads, Cache, then Documents as last resort
  const directories = [
    { dir: Directory.External, name: 'Downloads' },
    { dir: Directory.Cache, name: 'Cache' }, 
    { dir: Directory.Documents, name: 'Documents' }
  ];
  
  for (const { dir, name } of directories) {
    try {
      console.log(`Trying to save PDF to ${name} directory`);
      
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
          null,
          pdfBytes.subarray(i, i + chunkSize) as any
        );
      }
      const base64Data = btoa(binary);

      const result = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: dir,
      });

      console.log(`PDF saved successfully to ${name}:`, result.uri);
      return result.uri;
    } catch (error) {
      console.warn(`Failed to save to ${name}:`, error);
      // Continue to next directory
    }
  }
  
  throw new Error('Failed to save PDF to any available directory. Please check storage permissions.');
}

// Simple approach - just use Downloads directory directly
// async function downloadPDFSimple(
//   pdfBytes: Uint8Array,
//   filename: string
// ): Promise<string> {
//   try {
//     console.log('Downloading PDF to Downloads folder');
    
//     // Convert to base64 properly
//     let binary = '';
//     const chunkSize = 0x8000;
//     for (let i = 0; i < pdfBytes.length; i += chunkSize) {
//       binary += String.fromCharCode.apply(
//         null,
//         pdfBytes.subarray(i, i + chunkSize) as any
//       );
//     }
//     const base64Data = btoa(binary);

//     // Write directly to Downloads - most accessible directory
//     const result = await Filesystem.writeFile({
//       path: filename,
//       data: base64Data,
//       directory: Directory.External, // This is Downloads folder
//     });

//     console.log('PDF saved successfully to Downloads:', result.uri);
//     return result.uri;
//   } catch (error) {
//     console.error('PDF download to Downloads failed:', error);
//     throw new Error(
//       'Failed to save PDF to Downloads folder. Please check storage permissions.'
//     );
//   }
// }

/**
 * Shares the PDF using device native sharing
 */
export async function sharePDF(
  pdfBytes: Uint8Array,
  filename: string,
  title: string = 'Invoice'
): Promise<void> {
  try {
    const fileUri = await downloadPDF(pdfBytes, filename);
    
    await Share.share({
      title: title,
      text: 'Please find attached invoice',
      url: fileUri,
      dialogTitle: 'Share Invoice'
    });
  } catch (error) {
    console.error('PDF sharing failed:', error);
    throw new Error('Failed to share PDF. Please try again.');
  }
}

/**
 * Generates a filename for the invoice PDF
 */
export function generatePDFFilename(invoice: InvoiceWithDetails): string {
  const sanitizedTenant = invoice.tenantName.replace(/[^a-zA-Z0-9]/g, '_');
  const month = invoice.billingMonth.replace('-', '_');
  return `Invoice_${invoice.invoiceNumber}_${sanitizedTenant}_${month}.pdf`;
}

export { generateInvoicePDF, downloadPDF };