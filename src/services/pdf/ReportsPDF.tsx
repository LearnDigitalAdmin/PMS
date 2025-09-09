// ReportsPDF.tsx - Professional PDF Generation Service for Transcripts and Rent Sheets
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import type { TranscriptWithDetails, RentRecordWithDetails } from '../database/ReportsDatabase';

interface PDFGenerationOptions {
  includeWatermark?: boolean;
  customBranding?: {
    companyName?: string;
    contactInfo?: string;
  };
}

interface PDFColors {
  primary: [number, number, number];
  secondary: [number, number, number];
  text: [number, number, number];
  lightGray: [number, number, number];
  success: [number, number, number];
  warning: [number, number, number];
  danger: [number, number, number];
}

export class ReportsPDFService {
  private colors: PDFColors = {
    primary: [0.059, 0.459, 0.345], // Green-600 #0F7557
    secondary: [0.086, 0.624, 0.584], // Teal-600 #16A085
    text: [0.111, 0.125, 0.157], // Gray-900 #1C2028
    lightGray: [0.969, 0.973, 0.976], // Gray-50 #F7F8F9
    success: [0.133, 0.545, 0.133], // Green-700 #228B22
    warning: [0.827, 0.427, 0.094], // Orange-600 #D97706
    danger: [0.863, 0.078, 0.235], // Red-600 #DC143C
  };

  private defaultBranding = {
    companyName: 'PLOT YANGU',
    contactInfo: 'SMB KENYA LTD | +254791286165',
    website: 'www.plotyangu.co.ke'
  };

  // ==================== TRANSCRIPT PDF GENERATION ====================

  async generateTranscriptPDF(
    transcript: TranscriptWithDetails,
    options: PDFGenerationOptions = {}
  ): Promise<{ filename: string; pdfBytes: Uint8Array }> {
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([612, 792]); // US Letter size
    let yPosition = 750;

    // Header Section
    yPosition = this.drawTranscriptHeader(page, transcript, helveticaBoldFont, helveticaFont, yPosition);
    
    // Property and Landlord Information
    yPosition = this.drawPropertyLandlordInfo(page, transcript, timesRomanBoldFont, timesRomanFont, yPosition - 20);
    
    // Financial Summary Section
    yPosition = this.drawFinancialSummary(page, transcript, timesRomanBoldFont, timesRomanFont, yPosition - 25);
    
    // Tenant Summary
    yPosition = this.drawTenantSummary(page, transcript, timesRomanBoldFont, timesRomanFont, yPosition - 20);
    
    // Notes section (if exists)
    if (transcript.notes && transcript.notes.trim()) {
      yPosition = this.drawNotes(page, transcript.notes, timesRomanBoldFont, timesRomanFont, yPosition - 15);
    }
    
    // Footer
    this.drawPDFFooter(page, helveticaFont, { ...this.defaultBranding, ...options.customBranding });

    const pdfBytes = await pdfDoc.save();
    const filename = `transcript_${transcript.property.name.replace(/[^a-zA-Z0-9]/g, '_')}_${transcript.billingMonth}.pdf`;

    return { filename, pdfBytes };
  }

  private drawTranscriptHeader(
    page: PDFPage,
    transcript: TranscriptWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    // Main Title
    page.drawText('MONTHLY LANDLORD REMITTANCE TRANSCRIPT', {
      x: 50,
      y: y,
      size: 18,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 30;

    // Status badge
    const statusColor = this.getStatusColor(transcript.status);
    const statusText = transcript.status.toUpperCase();
    const statusWidth = regularFont.widthOfTextAtSize(statusText, 10) + 20;
    
    page.drawRectangle({
      x: width - statusWidth - 50,
      y: y - 5,
      width: statusWidth,
      height: 20,
      color: rgb(...statusColor),
    });

    page.drawText(statusText, {
      x: width - statusWidth - 40,
      y: y,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    });

    // Billing period
    page.drawText(`Billing Period: ${this.formatMonthYear(transcript.billingMonth)}`, {
      x: 50,
      y: y,
      size: 14,
      font: boldFont,
      color: rgb(...this.colors.text),
    });

    y -= 25;

    // Generation info
    const generatedDate = new Date(transcript.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    page.drawText(`Generated on: ${generatedDate}`, {
      x: 50,
      y: y,
      size: 10,
      font: regularFont,
      color: rgb(...this.colors.text),
    });

    if (transcript.sentDate) {
      const sentDate = new Date(transcript.sentDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      page.drawText(`Sent on: ${sentDate}`, {
        x: width - 150,
        y: y,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });
    }

    return y - 10;
  }

  private drawPropertyLandlordInfo(
    page: PDFPage,
    transcript: TranscriptWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    // Background rectangle
    page.drawRectangle({
      x: 50,
      y: y - 80,
      width: width - 100,
      height: 80,
      color: rgb(...this.colors.lightGray),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
    });

    y -= 15;

    // Property Information (Left Column)
    page.drawText('PROPERTY INFORMATION', {
      x: 70,
      y: y,
      size: 12,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 20;

    const propertyInfo = [
      ['Property Name:', transcript.property.name],
      ['Address:', transcript.property.address || 'Not specified'],
      ['Total Units:', `${transcript.property.maxUnits}`],
      ['Active Tenants:', `${transcript.tenantSummary.activeTenants} / ${transcript.tenantSummary.totalTenants}`],
    ];

    for (const [label, value] of propertyInfo) {
      page.drawText(label, {
        x: 70,
        y: y,
        size: 10,
        font: boldFont,
        color: rgb(...this.colors.text),
      });

      page.drawText(value, {
        x: 180,
        y: y,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });

      y -= 12;
    }

    // Landlord Information (Right Column)
    y = yPos - 15;
    const midX = width / 2 + 50;

    page.drawText('LANDLORD INFORMATION', {
      x: midX,
      y: y,
      size: 12,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 20;

    const landlordInfo = [
      ['Landlord Name:', transcript.landlordName],
      ['Contact:', transcript.landlordContact || 'Not provided'],
      ['Commission Rate:', `${transcript.agentCommissionRate.toFixed(1)}%`],
      ['Remittance Date:', transcript.sentDate ? new Date(transcript.sentDate).toLocaleDateString() : 'Pending'],
    ];

    for (const [label, value] of landlordInfo) {
      page.drawText(label, {
        x: midX,
        y: y,
        size: 10,
        font: boldFont,
        color: rgb(...this.colors.text),
      });

      page.drawText(value, {
        x: midX + 110,
        y: y,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });

      y -= 12;
    }

    return yPos - 90;
  }

  private drawFinancialSummary(
    page: PDFPage,
    transcript: TranscriptWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    // Section Title
    page.drawText('FINANCIAL SUMMARY', {
      x: 50,
      y: y,
      size: 14,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 25;

    // Table headers
    const tableTop = y;
    const tableHeight = (transcript.items.length + 4) * 20 + 30;
    
    // Table background
    page.drawRectangle({
      x: 50,
      y: tableTop - tableHeight,
      width: width - 100,
      height: tableHeight,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });

    // Table headers
    const headers = ['Description', 'Category', 'Amount'];
    const columnWidths = [250, 150, 112];
    let x = 70;

    page.drawRectangle({
      x: 50,
      y: y - 20,
      width: width - 100,
      height: 20,
      color: rgb(...this.colors.primary),
    });

    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], {
        x: x,
        y: y - 15,
        size: 11,
        font: boldFont,
        color: rgb(1, 1, 1),
      });
      x += columnWidths[i];
    }

    y -= 30;

    // Items rows
    const sortedItems = transcript.items.sort((a: { sortOrder: number; }, b: { sortOrder: number; }) => a.sortOrder - b.sortOrder);
    for (const item of sortedItems) {
      x = 70;

      // Alternate row background
      if (sortedItems.indexOf(item) % 2 === 1) {
        page.drawRectangle({
          x: 50,
          y: y - 15,
          width: width - 100,
          height: 20,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      page.drawText(item.description, {
        x: x,
        y: y,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });
      x += columnWidths[0];

      page.drawText(item.category || item.type, {
        x: x,
        y: y,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });
      x += columnWidths[1];

      const amountColor = item.isDeductible ? this.colors.danger : this.colors.success;
      const amountText = `${item.isDeductible ? '-' : '+'}KSh ${item.amount.toLocaleString()}`;
      
      page.drawText(amountText, {
        x: x,
        y: y,
        size: 10,
        font: regularFont,
        color: rgb(...amountColor),
      });

      y -= 20;
    }

    // Summary totals
    y -= 10;
    page.drawRectangle({
      x: 50,
      y: y - 60,
      width: width - 100,
      height: 60,
      color: rgb(...this.colors.primary),
    });

    const grossIncome = transcript.grossRentCollected + transcript.totalWaterCharges + 
                      transcript.totalPowerCharges + transcript.totalOtherCharges;

    const summaryItems: Array<[string, string, [number, number, number]]> = [
      ['Gross Income:', `KSh ${grossIncome.toLocaleString()}`, this.colors.lightGray],
      ['Total Deductions:', `KSh ${transcript.totalDeductibles.toLocaleString()}`, this.colors.danger],
      ['NET AMOUNT TO LANDLORD:', `KSh ${transcript.netAmountToLandlord.toLocaleString()}`, [1, 1, 1]],
    ];

    y -= 15;
    for (const [label, amount, color] of summaryItems) {
      const isMainTotal = label.includes('NET AMOUNT');
      
      page.drawText(label, {
        x: 70,
        y: y,
        size: isMainTotal ? 14 : 11,
        font: isMainTotal ? boldFont : regularFont,
        color: rgb(...color),
      });

      page.drawText(amount, {
        x: width - 150,
        y: y,
        size: isMainTotal ? 14 : 11,
        font: boldFont,
        color: rgb(...color),
      });

      y -= isMainTotal ? 20 : 15;
    }

    return tableTop - tableHeight - 10;
  }

  private drawTenantSummary(
    page: PDFPage,
    transcript: TranscriptWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    // Section Title
    page.drawText('TENANT SUMMARY', {
      x: 50,
      y: y,
      size: 14,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 30;

    // Summary boxes
    const summaryData: Array<[string, string, [number, number, number]]> = [
      ['Total Tenants', transcript.tenantSummary.totalTenants.toString(), this.colors.text],
      ['Active Tenants', transcript.tenantSummary.activeTenants.toString(), this.colors.success],
      ['Paid Invoices', transcript.tenantSummary.paidInvoices.toString(), this.colors.success],
      ['Unpaid Invoices', transcript.tenantSummary.unpaidInvoices.toString(), this.colors.danger],
    ];

    const boxWidth = (width - 120) / 4;
    let x = 50;

    for (const [label, value, color] of summaryData) {
      page.drawRectangle({
        x: x,
        y: y - 50,
        width: boxWidth,
        height: 50,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(...color),
        borderWidth: 2,
      });

      page.drawText(value, {
        x: x + boxWidth / 2 - regularFont.widthOfTextAtSize(value, 20) / 2,
        y: y - 25,
        size: 20,
        font: boldFont,
        color: rgb(...color),
      });

      page.drawText(label, {
        x: x + boxWidth / 2 - regularFont.widthOfTextAtSize(label, 10) / 2,
        y: y - 40,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });

      x += boxWidth + 10;
    }

    return y - 60;
  }

  // ==================== RENT RECORD SHEET PDF GENERATION ====================

  async generateRentRecordPDF(
    recordSheet: RentRecordWithDetails,
    options: PDFGenerationOptions = {}
  ): Promise<{ filename: string; pdfBytes: Uint8Array }> {
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Use landscape orientation for rent record sheet
    const page = pdfDoc.addPage([792, 612]); // Landscape US Letter
    let yPosition = 570;
    let currentPage = page;

    // Header Section
    yPosition = this.drawRentRecordHeader(currentPage, recordSheet, helveticaBoldFont, helveticaFont, yPosition);
    
    // Property Information and Summary Stats
    yPosition = this.drawRentRecordSummary(currentPage, recordSheet, timesRomanBoldFont, timesRomanFont, yPosition - 20);
    
    // Tenant Records Table
    const result = this.drawTenantRecordsTable(pdfDoc, currentPage, recordSheet, timesRomanBoldFont, timesRomanFont, yPosition - 25);
    currentPage = result.lastPage;
    yPosition = result.yPosition;
    
    // Performance Summary
    yPosition = this.drawPerformanceSummary(currentPage, recordSheet, timesRomanBoldFont, timesRomanFont, yPosition - 20);
    
    // Footer on all pages
    const pages = pdfDoc.getPages();
    for (const pdfPage of pages) {
      this.drawPDFFooter(pdfPage, helveticaFont, { ...this.defaultBranding, ...options.customBranding });
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `rent_record_${recordSheet.property.name.replace(/[^a-zA-Z0-9]/g, '_')}_${recordSheet.billingMonth}.pdf`;

    return { filename, pdfBytes };
  }

  private drawRentRecordHeader(
    page: PDFPage,
    recordSheet: RentRecordWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    // Main Title
    page.drawText('MONTHLY RENT RECORD SHEET', {
      x: 50,
      y: y,
      size: 20,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 35;

    // Property name and period
    page.drawText(`Property: ${recordSheet.property.name}`, {
      x: 50,
      y: y,
      size: 16,
      font: boldFont,
      color: rgb(...this.colors.text),
    });

    page.drawText(`Period: ${this.formatMonthYear(recordSheet.billingMonth)}`, {
      x: width - 250,
      y: y,
      size: 16,
      font: boldFont,
      color: rgb(...this.colors.text),
    });

    y -= 20;

    // Generation date and status
    const generatedDate = new Date(recordSheet.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    page.drawText(`Generated: ${generatedDate}`, {
      x: 50,
      y: y,
      size: 11,
      font: regularFont,
      color: rgb(...this.colors.text),
    });

    // Status
    const statusText = recordSheet.status.toUpperCase();
    const statusColor = recordSheet.status === 'current' ? this.colors.success : this.colors.warning;
    const statusWidth = regularFont.widthOfTextAtSize(statusText, 10) + 16;
    
    page.drawRectangle({
      x: width - statusWidth - 50,
      y: y - 3,
      width: statusWidth,
      height: 16,
      color: rgb(...statusColor),
    });

    page.drawText(statusText, {
      x: width - statusWidth - 42,
      y: y,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    });

    return y - 10;
  }

  private drawRentRecordSummary(
    page: PDFPage,
    recordSheet: RentRecordWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    // Background
    page.drawRectangle({
      x: 50,
      y: y - 70,
      width: width - 100,
      height: 70,
      color: rgb(...this.colors.lightGray),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
    });

    y -= 20;

    // Summary metrics
    const metrics: Array<[string, string, [number, number, number]]> = [
      ['Expected', `KSh ${recordSheet.totalRentExpected.toLocaleString()}`, this.colors.text],
      ['Collected', `KSh ${recordSheet.totalRentCollected.toLocaleString()}`, this.colors.success],
      ['Arrears', `KSh ${recordSheet.totalArrears.toLocaleString()}`, this.colors.danger],
      ['Collection Rate', `${recordSheet.collectionRate.toFixed(1)}%`, this.colors.secondary],
      ['Occupancy', `${recordSheet.occupiedUnits}/${recordSheet.totalUnits}`, this.colors.text],
    ];

    const metricWidth = (width - 140) / metrics.length;
    let x = 70;

    for (const [label, value, color] of metrics) {
      page.drawText(label, {
        x: x,
        y: y,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });

      page.drawText(value, {
        x: x,
        y: y - 15,
        size: 14,
        font: boldFont,
        color: rgb(...color),
      });

      x += metricWidth;
    }

    return y - 50;
  }

  private drawTableHeaders(
    page: PDFPage,
    headers: string[],
    columnWidths: number[],
    boldFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let x = 50;

    page.drawRectangle({
      x: 50,
      y: yPos - 15,
      width: width - 100,
      height: 15,
      color: rgb(...this.colors.primary),
    });

    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], {
        x: x + 2,
        y: yPos - 12,
        size: 9,
        font: boldFont,
        color: rgb(1, 1, 1),
      });
      x += columnWidths[i];
    }

    return yPos - 20;
  }

  private drawTenantRecordsTable(
    pdfDoc: PDFDocument,
    startPage: PDFPage,
    recordSheet: RentRecordWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): { lastPage: PDFPage; yPosition: number } {
    const { width } = startPage.getSize();
    let y = yPos;
    let currentPage = startPage;

    // Table title
    currentPage.drawText('TENANT RECORDS', {
      x: 50,
      y: y,
      size: 14,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 25;

    // Table headers
    const headers = ['Tenant', 'Unit', 'Rent', 'Water', 'Power', 'Other', 'Total Due', 'Paid', 'Balance', 'Status'];
    const columnWidths = [80, 40, 55, 45, 45, 45, 65, 60, 60, 50];
    
    // Draw initial headers
    y = this.drawTableHeaders(currentPage, headers, columnWidths, boldFont, y);

    // Data rows
    const rowHeight = 12;
    const minBottomMargin = 100;
    
    for (let i = 0; i < recordSheet.entries.length; i++) {
      // Check if we need a new page
      if (y < minBottomMargin) {
        currentPage = pdfDoc.addPage([792, 612]); // Landscape
        y = 570;
        
        // Re-draw table title and headers on new page
        currentPage.drawText('TENANT RECORDS (Continued)', {
          x: 50,
          y: y,
          size: 14,
          font: boldFont,
          color: rgb(...this.colors.primary),
        });
        y -= 25;
        y = this.drawTableHeaders(currentPage, headers, columnWidths, boldFont, y);
      }

      const entry = recordSheet.entries[i];
      let x = 50;

      // Alternate row background
      if (i % 2 === 1) {
        currentPage.drawRectangle({
          x: 50,
          y: y - rowHeight + 2,
          width: width - 100,
          height: rowHeight,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      // Data cells
      const cellData = [
        entry.tenantName.length > 12 ? entry.tenantName.substring(0, 12) + '...' : entry.tenantName,
        entry.unitNumber,
        entry.rentAmount.toLocaleString(),
        entry.waterCharges.toLocaleString(),
        entry.powerCharges.toLocaleString(),
        entry.otherCharges.toLocaleString(),
        entry.totalDue.toLocaleString(),
        entry.amountPaid.toLocaleString(),
        Math.abs(entry.balance).toLocaleString(),
        entry.paymentStatus.charAt(0).toUpperCase() + entry.paymentStatus.slice(1),
      ];

      for (let j = 0; j < cellData.length; j++) {
        let textColor = rgb(...this.colors.text);
        
        // Special coloring for balance and status
        if (j === 8) { // Balance column
          textColor = entry.balance > 0 ? rgb(...this.colors.danger) : 
                     entry.balance < 0 ? rgb(...this.colors.secondary) : 
                     rgb(...this.colors.success);
        } else if (j === 9) { // Status column
          textColor = entry.paymentStatus === 'paid' ? rgb(...this.colors.success) :
                     entry.paymentStatus === 'partial' ? rgb(...this.colors.warning) :
                     rgb(...this.colors.danger);
        }

        currentPage.drawText(cellData[j], {
          x: x + 2,
          y: y - 8,
          size: 8,
          font: regularFont,
          color: textColor,
        });
        x += columnWidths[j];
      }

      y -= rowHeight;
    }

    // Table footer with totals
    if (y < minBottomMargin) {
      currentPage = pdfDoc.addPage([792, 612]); // Landscape
      y = 570;
    }

    y -= 10;
    currentPage.drawRectangle({
      x: 50,
      y: y - 15,
      width: width - 100,
      height: 15,
      color: rgb(...this.colors.text),
    });

    const totalLabels = [
      'TOTALS',
      '', 
      recordSheet.entries.reduce((sum: number, e: any) => sum + e.rentAmount, 0).toLocaleString(),
      recordSheet.entries.reduce((sum: number, e: any) => sum + e.waterCharges, 0).toLocaleString(),
      recordSheet.entries.reduce((sum: number, e: any) => sum + e.powerCharges, 0).toLocaleString(),
      recordSheet.entries.reduce((sum: number, e: any) => sum + e.otherCharges, 0).toLocaleString(),
      recordSheet.totalRentExpected.toLocaleString(),
      recordSheet.totalRentCollected.toLocaleString(),
      recordSheet.totalArrears.toLocaleString(),
      ''
    ];

    let x = 50;
    for (let i = 0; i < totalLabels.length; i++) {
      currentPage.drawText(totalLabels[i], {
        x: x + 2,
        y: y - 12,
        size: 9,
        font: boldFont,
        color: rgb(1, 1, 1),
      });
      x += columnWidths[i];
    }

    return { lastPage: currentPage, yPosition: y - 20 };
  }

  private drawPerformanceSummary(
    page: PDFPage,
    recordSheet: RentRecordWithDetails,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    page.drawText('PERFORMANCE METRICS', {
      x: 50,
      y: y,
      size: 12,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 25;

    const performanceData: Array<[string, string, [number, number, number]]> = [
      ['On-Time Payments', recordSheet.summary.onTimePayments.toString(), this.colors.success],
      ['Late Payments', recordSheet.summary.latePayments.toString(), this.colors.warning],
      ['Defaulters', recordSheet.summary.defaulters.toString(), this.colors.danger],
      ['Avg. Collection Days', recordSheet.summary.averageCollectionDays.toString(), this.colors.text],
    ];

    const boxWidth = (width - 140) / 4;
    let x = 50;

    for (const [label, value, color] of performanceData) {
      page.drawRectangle({
        x: x,
        y: y - 40,
        width: boxWidth,
        height: 40,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(...color),
        borderWidth: 2,
      });

      page.drawText(value, {
        x: x + boxWidth / 2 - regularFont.widthOfTextAtSize(value, 16) / 2,
        y: y - 20,
        size: 16,
        font: boldFont,
        color: rgb(...color),
      });

      page.drawText(label, {
        x: x + boxWidth / 2 - regularFont.widthOfTextAtSize(label, 9) / 2,
        y: y - 35,
        size: 9,
        font: regularFont,
        color: rgb(...this.colors.text),
      });

      x += boxWidth + 10;
    }

    return y - 50;
  }

  private drawNotes(
    page: PDFPage,
    notes: string,
    boldFont: PDFFont,
    regularFont: PDFFont,
    yPos: number
  ): number {
    const { width } = page.getSize();
    let y = yPos;

    page.drawText('ADDITIONAL NOTES', {
      x: 50,
      y: y,
      size: 12,
      font: boldFont,
      color: rgb(...this.colors.primary),
    });

    y -= 20;

    // Notes box
    const notesHeight = Math.max(40, Math.ceil(notes.length / 80) * 12 + 20);
    page.drawRectangle({
      x: 50,
      y: y - notesHeight,
      width: width - 100,
      height: notesHeight,
      color: rgb(0.99, 0.99, 0.99),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
    });

    // Wrap text for notes
    const maxWidth = width - 120;
    const words = notes.split(' ');
    let currentLine = '';
    let lineY = y - 15;

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const lineWidth = regularFont.widthOfTextAtSize(testLine, 10);

      if (lineWidth > maxWidth && currentLine) {
        page.drawText(currentLine, {
          x: 60,
          y: lineY,
          size: 10,
          font: regularFont,
          color: rgb(...this.colors.text),
        });
        currentLine = word;
        lineY -= 12;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, {
        x: 60,
        y: lineY,
        size: 10,
        font: regularFont,
        color: rgb(...this.colors.text),
      });
    }

    return y - notesHeight - 10;
  }

  private drawPDFFooter(
    page: PDFPage,
    font: PDFFont,
    branding: { companyName: string; contactInfo: string; website?: string },
    _isLandscape: boolean = false
  ): void {
    const { width } = page.getSize();
    const y = 30;

    // Footer line
    page.drawLine({
      start: { x: 50, y: y + 15 },
      end: { x: width - 50, y: y + 15 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    // Branding text
    let footerText = `Generated by ${branding.companyName} | ${branding.contactInfo}`;
    if (branding.website) {
      footerText += ` | ${branding.website}`;
    }

    page.drawText(footerText, {
      x: 50,
      y: y,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Generation timestamp
    const timestamp = `Generated on ${new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;

    const timestampWidth = font.widthOfTextAtSize(timestamp, 8);
    page.drawText(timestamp, {
      x: width - timestampWidth - 50,
      y: y,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // ==================== FILE MANAGEMENT METHODS ====================

  async saveToDevice(filename: string, pdfBytes: Uint8Array): Promise<{ path: string; uri: string }> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Convert to base64 for mobile platforms
        const base64Data = this.uint8ArrayToBase64(pdfBytes);
        
        const result = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.External,
        });

        return { path: result.uri, uri: result.uri };
      } else {
        // For web, trigger download
        const arrayBuffer = new ArrayBuffer(pdfBytes.buffer.byteLength);
        const uint8Array = new Uint8Array(arrayBuffer);
        uint8Array.set(new Uint8Array(pdfBytes.buffer));
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        return { path: filename, uri: url };
      }
    } catch (error) {
      console.error('Error saving PDF:', error);
      throw new Error('Failed to save PDF to device');
    }
  }

  async shareViaWhatsApp(filename: string, pdfBytes: Uint8Array, phoneNumber?: string): Promise<void> {
    try {
      if (!Capacitor.isNativePlatform()) {
        throw new Error('WhatsApp sharing is only available on mobile devices');
      }

      // Save file first
      const { uri } = await this.saveToDevice(filename, pdfBytes);

      // Prepare WhatsApp message
      const message = `📊 Professional Property Report\n\nPlease find attached the ${filename.includes('transcript') ? 'Monthly Transcript' : 'Rent Record Sheet'}.\n\nGenerated by Plot Yangu\n📞 +254791286165`;

      const shareOptions: any = {
        title: 'Share Property Report',
        text: message,
        files: [uri],
        dialogTitle: 'Share via WhatsApp'
      };

      // If phone number is provided, try to share directly to WhatsApp
      if (phoneNumber) {
        shareOptions.url = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
      }

      await Share.share(shareOptions);
    } catch (error) {
      console.error('Error sharing via WhatsApp:', error);
      
      // Fallback to regular share
      await this.shareGeneral(filename, pdfBytes);
    }
  }

  async shareGeneral(filename: string, pdfBytes: Uint8Array): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Save file first
        const { uri } = await this.saveToDevice(filename, pdfBytes);

        await Share.share({
          title: 'Property Report',
          text: `Professional property report generated by Plot Yangu. For more information, contact +254791286165`,
          files: [uri],
          dialogTitle: 'Share Report'
        });
      } else {
        // For web, just download
        await this.saveToDevice(filename, pdfBytes);
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      throw new Error('Failed to share PDF');
    }
  }

  // ==================== UTILITY METHODS ====================

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    return btoa(binary);
  }

  private formatMonthYear(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  private getStatusColor(status: string): [number, number, number] {
    switch (status) {
      case 'draft': return this.colors.warning;
      case 'finalized': return this.colors.secondary;
      case 'sent': return this.colors.success;
      case 'acknowledged': return [0.612, 0.153, 0.690]; // Purple
      default: return this.colors.text;
    }
  }

  // ==================== BATCH OPERATIONS ====================

  async generateAndSaveTranscriptPDF(
    transcript: TranscriptWithDetails,
    options: PDFGenerationOptions = {}
  ): Promise<{ success: boolean; filename: string; path?: string; error?: string }> {
    try {
      const { filename, pdfBytes } = await this.generateTranscriptPDF(transcript, options);
      const { path } = await this.saveToDevice(filename, pdfBytes);
      
      return {
        success: true,
        filename,
        path
      };
    } catch (error) {
      console.error('Error generating and saving transcript PDF:', error);
      return {
        success: false,
        filename: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async generateAndSaveRentRecordPDF(
    recordSheet: RentRecordWithDetails,
    options: PDFGenerationOptions = {}
  ): Promise<{ success: boolean; filename: string; path?: string; error?: string }> {
    try {
      const { filename, pdfBytes } = await this.generateRentRecordPDF(recordSheet, options);
      const { path } = await this.saveToDevice(filename, pdfBytes);
      
      return {
        success: true,
        filename,
        path
      };
    } catch (error) {
      console.error('Error generating and saving rent record PDF:', error);
      return {
        success: false,
        filename: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async generateAndShareTranscriptPDF(
    transcript: TranscriptWithDetails,
    shareMethod: 'whatsapp' | 'general' = 'general',
    phoneNumber?: string,
    options: PDFGenerationOptions = {}
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    try {
      const { filename, pdfBytes } = await this.generateTranscriptPDF(transcript, options);
      
      if (shareMethod === 'whatsapp') {
        await this.shareViaWhatsApp(filename, pdfBytes, phoneNumber);
      } else {
        await this.shareGeneral(filename, pdfBytes);
      }
      
      return {
        success: true,
        filename
      };
    } catch (error) {
      console.error('Error generating and sharing transcript PDF:', error);
      return {
        success: false,
        filename: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async generateAndShareRentRecordPDF(
    recordSheet: RentRecordWithDetails,
    shareMethod: 'whatsapp' | 'general' = 'general',
    phoneNumber?: string,
    options: PDFGenerationOptions = {}
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    try {
      const { filename, pdfBytes } = await this.generateRentRecordPDF(recordSheet, options);
      
      if (shareMethod === 'whatsapp') {
        await this.shareViaWhatsApp(filename, pdfBytes, phoneNumber);
      } else {
        await this.shareGeneral(filename, pdfBytes);
      }
      
      return {
        success: true,
        filename
      };
    } catch (error) {
      console.error('Error generating and sharing rent record PDF:', error);
      return {
        success: false,
        filename: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ==================== PREVIEW METHODS ====================

  async generateTranscriptPreview(transcript: TranscriptWithDetails): Promise<string> {
    const { pdfBytes } = await this.generateTranscriptPDF(transcript);
    const base64 = this.uint8ArrayToBase64(pdfBytes);
    return `data:application/pdf;base64,${base64}`;
  }

  async generateRentRecordPreview(recordSheet: RentRecordWithDetails): Promise<string> {
    const { pdfBytes } = await this.generateRentRecordPDF(recordSheet);
    const base64 = this.uint8ArrayToBase64(pdfBytes);
    return `data:application/pdf;base64,${base64}`;
  }

  // ==================== ADVANCED FEATURES ====================

  async generateBatchReports(
    transcripts: TranscriptWithDetails[],
    rentRecords: RentRecordWithDetails[],
    options: PDFGenerationOptions = {}
  ): Promise<{ 
    success: boolean; 
    results: Array<{ 
      type: 'transcript' | 'rent_record'; 
      filename: string; 
      success: boolean; 
      error?: string; 
    }>; 
  }> {
    const results: Array<{ 
      type: 'transcript' | 'rent_record'; 
      filename: string; 
      success: boolean; 
      error?: string; 
    }> = [];

    // Process transcripts
    for (const transcript of transcripts) {
      try {
        const result = await this.generateAndSaveTranscriptPDF(transcript, options);
        results.push({
          type: 'transcript',
          filename: result.filename,
          success: result.success,
          error: result.error
        });
      } catch (error) {
        results.push({
          type: 'transcript',
          filename: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Process rent records
    for (const rentRecord of rentRecords) {
      try {
        const result = await this.generateAndSaveRentRecordPDF(rentRecord, options);
        results.push({
          type: 'rent_record',
          filename: result.filename,
          success: result.success,
          error: result.error
        });
      } catch (error) {
        results.push({
          type: 'rent_record',
          filename: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const allSuccessful = results.every(r => r.success);
    
    return {
      success: allSuccessful,
      results
    };
  }

  async generateCustomReport(
    _title: string,
    data: any,
    template: 'transcript' | 'rent_record' = 'transcript',
    options: PDFGenerationOptions = {}
  ): Promise<{ filename: string; pdfBytes: Uint8Array }> {
    // This method allows for custom report generation using existing templates
    // but with custom data. Useful for specialized reports.
    
    if (template === 'transcript') {
      return await this.generateTranscriptPDF(data, options);
    } else {
      return await this.generateRentRecordPDF(data, options);
    }
  }

  // ==================== ERROR HANDLING & VALIDATION ====================

//   private validateTranscriptData(transcript: TranscriptWithDetails): boolean {
//     if (!transcript || !transcript.property || !transcript.property.name) {
//       throw new Error('Invalid transcript data: missing property information');
//     }
    
//     if (!transcript.billingMonth || !transcript.createdAt) {
//       throw new Error('Invalid transcript data: missing billing or creation date');
//     }
    
//     if (!transcript.items || !Array.isArray(transcript.items)) {
//       throw new Error('Invalid transcript data: missing or invalid items array');
//     }
    
//     if (!transcript.tenantSummary) {
//       throw new Error('Invalid transcript data: missing tenant summary');
//     }
    
//     return true;
//   }

//   private validateRentRecordData(recordSheet: RentRecordWithDetails): boolean {
//     if (!recordSheet || !recordSheet.property || !recordSheet.property.name) {
//       throw new Error('Invalid rent record data: missing property information');
//     }
    
//     if (!recordSheet.billingMonth || !recordSheet.createdAt) {
//       throw new Error('Invalid rent record data: missing billing or creation date');
//     }
    
//     if (!recordSheet.entries || !Array.isArray(recordSheet.entries)) {
//       throw new Error('Invalid rent record data: missing or invalid entries array');
//     }
    
//     if (!recordSheet.summary) {
//       throw new Error('Invalid rent record data: missing summary information');
//     }
    
//     return true;
//   }

  // ==================== PERFORMANCE OPTIMIZATION ====================

//   private optimizeForLargeDatasets(entries: any[]): any[] {
//     // If dataset is very large (>1000 entries), we might want to:
//     // 1. Paginate the data
//     // 2. Summarize some sections
//     // 3. Use smaller fonts
//     // 4. Compress similar entries
    
//     if (entries.length <= 1000) {
//       return entries;
//     }
    
//     // For very large datasets, we could implement summarization logic here
//     console.warn(`Large dataset detected (${entries.length} entries). Consider implementing summarization.`);
    
//     return entries;
//   }
}

// ==================== SINGLETON INSTANCE ====================
export const reportsPDFService = new ReportsPDFService();