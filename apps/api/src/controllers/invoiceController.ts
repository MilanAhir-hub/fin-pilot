import type { Request, Response } from 'express';
import type { CancelInvoiceInput, CreateInvoiceInput, UpdateInvoiceInput } from '@finpilot/shared';
import { formatINR } from '@finpilot/shared';
import type { InvoiceDoc } from '../models/Invoice';
import { invoiceService } from '../services/invoiceService';
import { generateInvoicePdf } from '../services/invoicePdfService';
import { partyRepo } from '../repositories/partyRepo';
import { sendMail } from '../services/mailService';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/respond';

function dto(invoice: InvoiceDoc) {
  const { _id, companyId: _c, __v: _v, ...rest } = invoice as InvoiceDoc & { __v?: number };
  return { id: String(_id), ...rest };
}

export const invoiceController = {
  async create(req: Request, res: Response) {
    ok(
      res,
      { invoice: dto(await invoiceService.createDraft(req.body as CreateInvoiceInput)) },
      201,
    );
  },

  async list(req: Request, res: Response) {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    ok(res, { invoices: (await invoiceService.list(status)).map(dto) });
  },

  async get(req: Request, res: Response) {
    ok(res, { invoice: dto(await invoiceService.get(String(req.params.id))) });
  },

  async update(req: Request, res: Response) {
    ok(res, {
      invoice: dto(
        await invoiceService.updateDraft(String(req.params.id), req.body as UpdateInvoiceInput),
      ),
    });
  },

  async issue(req: Request, res: Response) {
    ok(res, { invoice: dto(await invoiceService.issue(String(req.params.id))) }, 201);
  },

  async cancel(req: Request, res: Response) {
    ok(res, {
      invoice: dto(
        await invoiceService.cancel(String(req.params.id), (req.body as CancelInvoiceInput).reason),
      ),
    });
  },

  async send(req: Request, res: Response) {
    const invoice = await invoiceService.get(String(req.params.id));
    if (invoice.status === 'draft')
      throw new AppError('DOC_CANNOT_EDIT_ISSUED', 409, { reason: 'issue before sending' });
    let to =
      typeof req.body?.email === 'string' && req.body.email.trim() ? req.body.email.trim() : null;
    if (!to && invoice.partyId) {
      const party = await partyRepo.findById(String(invoice.partyId));
      if (party?.email) to = party.email;
    }
    if (!to) throw new AppError('SYS_VALIDATION_FAILED', 422, { email: 'required' });

    const invoiceNum = invoice.invoiceNumber ?? 'Invoice';
    const partyName = invoice.partySnapshot?.name || 'Valued Customer';
    const issueDateStr = invoice.issueDate ? invoice.issueDate.toISOString().slice(0, 10) : '';
    const dueDateStr = invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : '';

    const linesHtml = invoice.lines
      .map(
        (l) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 12px; font-size: 14px; color: #1e293b;">${l.description}</td>
          <td style="padding: 10px 12px; font-size: 14px; text-align: center; color: #64748b;">${l.qty}</td>
          <td style="padding: 10px 12px; font-size: 14px; text-align: right; color: #64748b;">${formatINR(l.ratePaise)}</td>
          <td style="padding: 10px 12px; font-size: 14px; text-align: right; font-weight: 600; color: #0f172a;">${formatINR(l.lineTotalPaise)}</td>
        </tr>`,
      )
      .join('');

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 28px 32px; color: #ffffff;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; color: #FF4404;">FinPilot</h1>
                <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Automated Financial Operating System</p>
              </div>
              <div style="text-align: right;">
                <span style="display: inline-block; background: rgba(255, 68, 4, 0.2); border: 1px solid rgba(255, 68, 4, 0.4); color: #ff6b35; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">${invoice.status}</span>
              </div>
            </div>
          </div>

          <!-- Invoice Details Bar -->
          <div style="padding: 24px 32px; background: #fdfdfe; border-bottom: 1px solid #f1f5f9;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="vertical-align: top; width: 50%;">
                  <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600;">Billed To</p>
                  <p style="margin: 4px 0 0; font-size: 15px; font-weight: 700; color: #0f172a;">${partyName}</p>
                </td>
                <td style="vertical-align: top; width: 50%; text-align: right;">
                  <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600;">Invoice Number</p>
                  <p style="margin: 4px 0 0; font-size: 15px; font-weight: 700; color: #0f172a;">${invoiceNum}</p>
                  <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Issued: ${issueDateStr} | Due: ${dueDateStr}</p>
                </td>
              </tr>
            </table>
          </div>

          <!-- Line Items -->
          <div style="padding: 24px 32px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase;">Description</th>
                  <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase;">Qty</th>
                  <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase;">Rate</th>
                  <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${linesHtml}
              </tbody>
            </table>

            <!-- Summary Table -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <tr>
                <td style="width: 55%;"></td>
                <td style="width: 45%;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Taxable Value:</td>
                      <td style="padding: 4px 0; font-size: 13px; text-align: right; color: #1e293b;">${formatINR(invoice.taxableValuePaise)}</td>
                    </tr>
                    ${invoice.cgstPaise ? `<tr><td style="padding: 4px 0; font-size: 13px; color: #64748b;">CGST:</td><td style="padding: 4px 0; font-size: 13px; text-align: right; color: #1e293b;">${formatINR(invoice.cgstPaise)}</td></tr>` : ''}
                    ${invoice.sgstPaise ? `<tr><td style="padding: 4px 0; font-size: 13px; color: #64748b;">SGST:</td><td style="padding: 4px 0; font-size: 13px; text-align: right; color: #1e293b;">${formatINR(invoice.sgstPaise)}</td></tr>` : ''}
                    ${invoice.igstPaise ? `<tr><td style="padding: 4px 0; font-size: 13px; color: #64748b;">IGST:</td><td style="padding: 4px 0; font-size: 13px; text-align: right; color: #1e293b;">${formatINR(invoice.igstPaise)}</td></tr>` : ''}
                    <tr style="border-top: 2px solid #e2e8f0;">
                      <td style="padding: 10px 0 4px; font-size: 15px; font-weight: 700; color: #0f172a;">Grand Total:</td>
                      <td style="padding: 10px 0 4px; font-size: 16px; font-weight: 700; text-align: right; color: #FF4404;">${formatINR(invoice.grandTotalPaise)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #0f172a;">Amount Due:</td>
                      <td style="padding: 4px 0; font-size: 13px; font-weight: 600; text-align: right; color: #0f172a;">${formatINR(invoice.amountDuePaise)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>

          <!-- Footer -->
          <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">Thank you for your business! This is an electronically generated invoice.</p>
          </div>
        </div>
      </body>
    </html>
    `;

    const pdfBuffer = await generateInvoicePdf(invoice);
    const pdfFilename = `${(invoice.invoiceNumber || 'invoice').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;

    try {
      await sendMail({
        to,
        subject: `Invoice ${invoice.invoiceNumber} — ${formatINR(invoice.grandTotalPaise)}`,
        text: [
          `Invoice ${invoice.invoiceNumber} dated ${issueDateStr}`,
          `Billed to: ${partyName}`,
          `Amount due: ${formatINR(invoice.amountDuePaise)} (due ${dueDateStr})`,
          '',
          ...invoice.lines.map(
            (l) =>
              `${l.description} — ${l.qty} × ${formatINR(l.ratePaise)} = ${formatINR(l.lineTotalPaise)}`,
          ),
          '',
          `Taxable: ${formatINR(invoice.taxableValuePaise)} · CGST: ${formatINR(invoice.cgstPaise)} · SGST: ${formatINR(invoice.sgstPaise)} · IGST: ${formatINR(invoice.igstPaise)}`,
          `Grand Total: ${formatINR(invoice.grandTotalPaise)}`,
          '',
          'Please find the official PDF invoice attached to this email.',
        ].join('\n'),
        html,
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (err) {
      throw new AppError('INTEGRATION_ERROR', 502, {
        message: err instanceof Error ? err.message : 'Failed to deliver email through mail provider',
      });
    }

    ok(res, { sent: true });
  },

  async pdf(req: Request, res: Response) {
    const invoice = await invoiceService.get(String(req.params.id));
    const pdfBuffer = await generateInvoicePdf(invoice);
    const filename = `${(invoice.invoiceNumber || 'invoice').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  },
};
