import PDFDocument from 'pdfkit';
import type { InvoiceDoc } from '../models/Invoice';

function formatRupees(paise: number): string {
  const rupees = (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Rs. ${rupees}`;
}

export async function generateInvoicePdf(invoice: InvoiceDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Invoice ${invoice.invoiceNumber || 'Draft'}`,
        Author: 'FinPilot',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const primaryColor = '#16213E';
    const accentColor = '#FF4404';
    const textColor = '#1E293B';
    const mutedColor = '#64748B';
    const borderColor = '#E2E8F0';
    const lightBg = '#F8FAFC';

    const pageWidth = 595.28; // A4 width in pt
    const margin = 40;
    const contentWidth = pageWidth - margin * 2; // 515.28 pt

    // 1. Header Banner
    doc.rect(margin, margin, contentWidth, 54).fill(primaryColor);

    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('FINPILOT', margin + 16, margin + 14);

    doc
      .fillColor('#94A3B8')
      .font('Helvetica')
      .fontSize(9)
      .text('Automated Financial Operating System', margin + 16, margin + 36);

    const invoiceTitle = 'TAX INVOICE';
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(invoiceTitle, margin, margin + 18, {
        align: 'right',
        width: contentWidth - 16,
      });

    // 2. Status & Details Bar
    let y = margin + 66;

    // Left: Billed To
    doc
      .rect(margin, y, contentWidth * 0.52, 90)
      .fillAndStroke(lightBg, borderColor);

    doc
      .fillColor(mutedColor)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('BILLED TO', margin + 14, y + 10);

    const partyName = invoice.partySnapshot?.name || 'Valued Customer';
    doc
      .fillColor(textColor)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(partyName, margin + 14, y + 24, { width: contentWidth * 0.48 });

    if (invoice.partySnapshot?.gstin) {
      doc
        .fillColor(mutedColor)
        .font('Helvetica')
        .fontSize(9)
        .text(`GSTIN: ${invoice.partySnapshot.gstin}`, margin + 14, y + 42);
    }

    if (invoice.partySnapshot?.stateCode) {
      doc
        .fillColor(mutedColor)
        .font('Helvetica')
        .fontSize(9)
        .text(`State Code: ${invoice.partySnapshot.stateCode}`, margin + 14, y + 56);
    }

    // Right: Invoice Metadata
    const metaX = margin + contentWidth * 0.54;
    const metaWidth = contentWidth * 0.46;
    doc.rect(metaX, y, metaWidth, 90).fillAndStroke(lightBg, borderColor);

    const issueDateStr = invoice.issueDate
      ? new Date(invoice.issueDate).toISOString().slice(0, 10)
      : 'N/A';
    const dueDateStr = invoice.dueDate
      ? new Date(invoice.dueDate).toISOString().slice(0, 10)
      : 'N/A';
    const invNo = invoice.invoiceNumber || 'DRAFT';

    doc
      .fillColor(mutedColor)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('INVOICE NUMBER', metaX + 14, y + 10);

    doc
      .fillColor(accentColor)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(invNo, metaX + 14, y + 22);

    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(9)
      .text(`Date of Issue: ${issueDateStr}`, metaX + 14, y + 40);

    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(9)
      .text(`Due Date: ${dueDateStr}`, metaX + 14, y + 54);

    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(8)
      .text(`Status: ${(invoice.status || 'DRAFT').toUpperCase()}`, metaX + 14, y + 68);

    // 3. Line Items Table
    y += 105;

    // Table Header
    doc.rect(margin, y, contentWidth, 22).fill('#1E293B');

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);

    doc.text('#', margin + 8, y + 7, { width: 20 });
    doc.text('DESCRIPTION', margin + 32, y + 7, { width: 190 });
    doc.text('QTY', margin + 226, y + 7, { width: 36, align: 'center' });
    doc.text('RATE', margin + 266, y + 7, { width: 70, align: 'right' });
    doc.text('GST', margin + 340, y + 7, { width: 44, align: 'center' });
    doc.text('TAXABLE', margin + 388, y + 7, { width: 60, align: 'right' });
    doc.text('TOTAL', margin + 452, y + 7, { width: 56, align: 'right' });

    y += 22;

    const lines = invoice.lines || [];
    let isOdd = false;

    lines.forEach((l, idx) => {
      const rowHeight = 22;

      if (isOdd) {
        doc.rect(margin, y, contentWidth, rowHeight).fill('#F8FAFC');
      }
      doc.rect(margin, y, contentWidth, rowHeight).stroke(borderColor);

      doc.fillColor(textColor).font('Helvetica').fontSize(8.5);

      doc.text(String(idx + 1), margin + 8, y + 6, { width: 20 });
      doc.text(l.description || '-', margin + 32, y + 6, { width: 190, ellipsis: true });
      doc.text(String(l.qty), margin + 226, y + 6, { width: 36, align: 'center' });
      doc.text(formatRupees(l.ratePaise), margin + 266, y + 6, { width: 70, align: 'right' });
      doc.text(`${l.gstRate}%`, margin + 340, y + 6, { width: 44, align: 'center' });
      doc.text(formatRupees(l.taxablePaise || (l.qty * l.ratePaise)), margin + 388, y + 6, { width: 60, align: 'right' });
      doc.font('Helvetica-Bold').text(formatRupees(l.lineTotalPaise), margin + 452, y + 6, { width: 56, align: 'right' });

      y += rowHeight;
      isOdd = !isOdd;
    });

    // 4. Totals Summary Table (Right aligned)
    y += 15;
    const summaryWidth = 240;
    const summaryX = margin + contentWidth - summaryWidth;

    doc.rect(summaryX, y, summaryWidth, 120).fillAndStroke(lightBg, borderColor);

    let sy = y + 8;
    const addSummaryRow = (label: string, value: string, bold = false) => {
      doc
        .fillColor(bold ? textColor : mutedColor)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(label, summaryX + 12, sy, { width: 110 });

      doc
        .fillColor(bold ? textColor : textColor)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(value, summaryX + 124, sy, { width: 104, align: 'right' });

      sy += 16;
    };

    addSummaryRow('Taxable Value:', formatRupees(invoice.taxableValuePaise || 0));

    if (invoice.cgstPaise) {
      addSummaryRow('CGST:', formatRupees(invoice.cgstPaise));
    }
    if (invoice.sgstPaise) {
      addSummaryRow('SGST:', formatRupees(invoice.sgstPaise));
    }
    if (invoice.igstPaise) {
      addSummaryRow('IGST:', formatRupees(invoice.igstPaise));
    }
    if (invoice.cessPaise) {
      addSummaryRow('Cess:', formatRupees(invoice.cessPaise));
    }
    if (invoice.roundOffPaise) {
      addSummaryRow('Round Off:', formatRupees(invoice.roundOffPaise));
    }

    // Grand Total Bar
    doc.rect(summaryX, sy + 2, summaryWidth, 24).fill(primaryColor);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text('Grand Total:', summaryX + 12, sy + 8, { width: 110 });

    doc
      .fillColor('#FF6B35')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(formatRupees(invoice.grandTotalPaise || 0), summaryX + 124, sy + 8, {
        width: 104,
        align: 'right',
      });

    sy += 32;

    // Amount Due
    doc
      .fillColor(textColor)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text('Amount Due:', summaryX + 12, sy, { width: 110 });

    doc
      .fillColor(textColor)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(formatRupees(invoice.amountDuePaise || 0), summaryX + 124, sy, {
        width: 104,
        align: 'right',
      });

    // 5. Notes / Terms
    const notesX = margin;
    const notesWidth = contentWidth - summaryWidth - 20;

    doc
      .fillColor(mutedColor)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('TERMS & CONDITIONS', notesX, y + 8);

    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(8)
      .text(
        '1. Payment is due within the terms specified on this invoice.\n2. Please quote invoice number when remitting funds.\n3. This is a computer-generated tax invoice and requires no physical signature.',
        notesX,
        y + 22,
        { width: notesWidth, lineGap: 3 },
      );

    // 6. Page Footer
    const footerY = 780;
    doc.rect(margin, footerY, contentWidth, 1).fill(borderColor);

    doc
      .fillColor(mutedColor)
      .font('Helvetica')
      .fontSize(8)
      .text(
        'FinPilot • Automated Financial Operating System • Powered by AI & Real-time Ledger',
        margin,
        footerY + 10,
        { align: 'center', width: contentWidth },
      );

    doc.end();
  });
}
