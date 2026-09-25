/**
 * Documents + OCR cascade (plan.md §16, §32 Phase 18).
 * Cascade: text layer (₹0) → vision (paid, behind an interface; real
 * Tesseract/Gemini/DocAI providers slot in at config). The extraction
 * CONTRACT: every field carries confidence; below threshold the value is
 * NULL — a low-confidence field renders empty, never guessed. The
 * arithmetic cross-check flags taxable+tax ≠ total.
 */
import { validateGstin } from '@finpilot/shared';
import { Document, type DocumentDoc, type ExtractedField } from '../models/Document';
import { billService } from './billService';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

const CONFIDENCE_FLOOR = 0.7;

function gate<T>(
  value: T | null,
  confidence: number,
  meta?: { status?: 'valid' | 'not_found' | 'review'; optional?: boolean },
): ExtractedField<T> {
  const isHighConfidence = confidence >= CONFIDENCE_FLOOR && value !== null;
  let status: 'valid' | 'not_found' | 'review' = meta?.status ?? 'valid';
  if (!meta?.status) {
    if (isHighConfidence) {
      status = 'valid';
    } else if (confidence > 0 && confidence < CONFIDENCE_FLOOR) {
      status = 'review';
    } else {
      status = 'not_found';
    }
  }
  return {
    value: isHighConfidence ? value : null,
    confidence,
    status,
    optional: meta?.optional ?? false,
  };
}

const HEADER_LINE_REGEX =
  /^(tax\s+invoice|retail\s+invoice|invoice|bill\s+of\s+supply|cash\s+memo|receipt|estimate|quotation|proforma\s+invoice|credit\s+note|debit\s+note|original\s+for\s+recipient|duplicate\s+for\s+transporter|triplicate\s+for\s+supplier|e-way\s+bill|delivery\s+challan|statement|purchase\s+order)\b/i;

const FALSE_NUMBER_WORDS = new Set([
  'DATE',
  'DATED',
  'DT',
  'DETAILS',
  'OF',
  'FOR',
  'TO',
  'FROM',
  'CASH',
  'DRAFT',
  'PAGE',
  'AMOUNT',
  'TOTAL',
  'RS',
  'INR',
]);

/** Field parsing over raw text — the same contract for both cascade tiers. */
export function parseInvoiceText(text: string, baseConfidence: number) {
  // Vendor name: pick first plausible non-header, non-label company line
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let vendorCandidate: string | null = null;
  for (const line of lines) {
    if (HEADER_LINE_REGEX.test(line)) continue;
    if (
      /^(date|invoice|bill|gstin|pan|cin|to|from|total|taxable|gst|phone|tel|email|fssai|hsn|sac)\b/i.test(
        line,
      )
    ) {
      continue;
    }
    if (!/[a-zA-Z]{2,}/.test(line)) continue;
    vendorCandidate = line;
    break;
  }

  // GSTIN: checksum-checked if pattern exists
  const gstinMatch = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])\b/.exec(text);
  const hasGstinPattern = Boolean(gstinMatch);
  const validGstin = gstinMatch && validateGstin(gstinMatch[1]!) ? gstinMatch[1]! : null;

  // Document / bill number: avoid false positives on header keywords
  const numberMatch = /(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:-]?\s*([A-Z0-9/-]+)/i.exec(text);
  let rawNumber = numberMatch?.[1]?.trim() ?? null;
  let numberReview = false;
  if (rawNumber && FALSE_NUMBER_WORDS.has(rawNumber.toUpperCase())) {
    rawNumber = null;
    numberReview = true;
  }

  // Document date: validate calendar ranges (dd/mm/yyyy)
  const dateMatch = /\b(\d{2}[/-]\d{2}[/-]\d{4})\b/.exec(text);
  let validDate: string | null = null;
  let dateReview = false;
  if (dateMatch) {
    const [d, m, y] = dateMatch[1]!.split(/[/-]/).map(Number);
    if (d! >= 1 && d! <= 31 && m! >= 1 && m! <= 12 && y! >= 1990 && y! <= 2100) {
      validDate = dateMatch[1]!;
    } else {
      dateReview = true;
    }
  }

  const money = (label: RegExp) => {
    const m = label.exec(text);
    if (!m) return null;
    const n = Number(m[1]!.replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const totalPaise = money(/total\s*[:-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const taxablePaise = money(
    /taxable\s*(?:value)?\s*[:-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  );
  const taxPaise = money(
    /(?:gst|tax)\s*(?:amount)?\s*[:-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  );

  // Arithmetic check and sanity check (taxable must not exceed total)
  const amountMismatch =
    taxablePaise !== null && totalPaise !== null && taxablePaise > totalPaise;

  const arithmeticOk =
    totalPaise !== null && taxablePaise !== null && taxPaise !== null
      ? taxablePaise + taxPaise === totalPaise && !amountMismatch
      : null;

  const hasMismatch = arithmeticOk === false || amountMismatch;
  const numberConfidence = hasMismatch ? 0.4 : baseConfidence;
  const moneyStatus: 'review' | 'valid' = hasMismatch ? 'review' : 'valid';

  return {
    vendorName: vendorCandidate
      ? gate<string>(vendorCandidate, baseConfidence, { status: 'valid', optional: false })
      : gate<string>(null, 0, { status: 'not_found', optional: false }),
    gstin: validGstin
      ? gate<string>(validGstin, 0.99, { status: 'valid', optional: true })
      : hasGstinPattern
        ? gate<string>(null, 0.4, { status: 'review', optional: true })
        : gate<string>(null, 0, { status: 'not_found', optional: true }),
    documentNumber: rawNumber
      ? gate<string>(rawNumber, baseConfidence, { status: 'valid', optional: true })
      : numberReview
        ? gate<string>(null, 0.3, { status: 'review', optional: true })
        : gate<string>(null, 0, { status: 'not_found', optional: true }),
    documentDate: validDate
      ? gate<string>(validDate, baseConfidence, { status: 'valid', optional: true })
      : dateReview
        ? gate<string>(null, 0.3, { status: 'review', optional: true })
        : gate<string>(null, 0, { status: 'not_found', optional: true }),
    totalPaise:
      totalPaise !== null
        ? gate<number>(totalPaise, numberConfidence, { status: moneyStatus, optional: false })
        : gate<number>(null, 0, { status: 'not_found', optional: false }),
    taxablePaise:
      taxablePaise !== null
        ? gate<number>(taxablePaise, numberConfidence, { status: moneyStatus, optional: true })
        : gate<number>(null, 0, { status: 'not_found', optional: true }),
    arithmeticOk,
  };
}

/**
 * Vision tier — the mock "reads" the buffer as text at lower confidence; the
 * real cascade (src/ocr) replaces it at boot.
 *
 * `engine` is optional so the placeholder above still satisfies the contract.
 * A real extractor reports which tier it used, because a digital PDF read
 * from its own text layer must not be labelled "vision" in the UI or counted
 * as vision spend — §16 is explicit that clean PDFs never reach a model.
 */
export interface VisionExtractor {
  extract(content: Buffer): Promise<{
    text: string;
    costPaise: number;
    engine?: 'text-layer' | 'vision';
    /**
     * What the engine itself thought of the read, 0–1. Optional, but supply
     * it if you can: without it every OCR result is scored at the same flat
     * tier constant, so a bill photographed in bad light presents a misread
     * date as confidently as a clean scan presents a correct one.
     */
    confidence?: number;
  }>;
}
let vision: VisionExtractor = {
  async extract(content) {
    return { text: content.toString('utf8'), costPaise: 150 }; // ~₹1.50/page
  },
};
export const setVisionExtractor = (v: VisionExtractor): void => void (vision = v);

export const documentService = {
  async upload(input: {
    filename: string;
    mimeType: string;
    contentBase64: string;
  }): Promise<DocumentDoc> {
    const ctx = requireCompanyContext();
    const content = Buffer.from(input.contentBase64, 'base64');
    const doc = await Document.create({
      filename: input.filename,
      mimeType: input.mimeType,
      content,
      uploadedBy: ctx.userId,
    });

    // tier 1 — the text layer, free. "text/*" (and PDFs with a text layer,
    // which the real pdf parser detects) never touch a paid API.
    const hasTextLayer =
      input.mimeType.startsWith('text/') || input.mimeType === 'application/pdf+text';
    if (hasTextLayer) {
      doc.extraction = parseInvoiceText(content.toString('utf8'), 0.95);
      doc.extractedBy = 'text-layer';
      doc.costPaise = 0; // a clean PDF costs ₹0 to extract
    } else {
      const result = await vision.extract(content);
      // A real cascade may have found a text layer inside a PDF the mimeType
      // did not advertise; trust what it says it did.
      const engine = result.engine ?? 'vision';
      // The engine's own confidence when it reports one, so a degraded scan
      // sinks below CONFIDENCE_FLOOR and blanks its fields instead of
      // presenting a misread value at the tier's flat score.
      const base = result.confidence ?? (engine === 'text-layer' ? 0.95 : 0.8);
      doc.extraction = parseInvoiceText(result.text, base);
      doc.extractedBy = engine;
      doc.costPaise = result.costPaise;
    }
    doc.status = 'extracted';
    await doc.save();
    return doc.toObject();
  },

  /**
   * Everything uploaded for this company, newest first.
   *
   * `content` is excluded at the query, not stripped afterwards: a page of
   * scanned bills is tens of megabytes of Buffer, and none of it is needed to
   * render the review table.
   */
  list(status?: string): Promise<DocumentDoc[]> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return Document.find(filter)
      .select('-content')
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .lean() as unknown as Promise<DocumentDoc[]>;
  },

  async get(id: string): Promise<DocumentDoc> {
    const doc = await Document.findOne({ _id: id }).lean();
    if (!doc) throw new AppError('SYS_NOT_FOUND', 404);
    return doc as unknown as DocumentDoc; // lean() types content as BSON Binary
  },

  async delete(id: string): Promise<void> {
    const doc = await Document.findOne({ _id: id });
    if (!doc) throw new AppError('SYS_NOT_FOUND', 404);
    await Document.deleteOne({ _id: id });
  },

  /**
   * "Create bill from document": only HIGH-confidence fields flow into the
   * draft; amounts are recomputed server-side at approval anyway (I5).
   */
  async createBill(
    documentId: string,
    input: {
      partyId: string;
      gstRate: number;
      vendorBillNumber?: string;
      taxablePaise?: number;
    },
  ) {
    const doc = await Document.findOne({ _id: documentId });
    if (!doc?.extraction) throw new AppError('DOC_INVALID_STATE', 409);
    if (doc.billId)
      throw new AppError('DOC_INVALID_STATE', 409, { reason: 'bill already created' });
    const ex = doc.extraction;

    // Use user-provided bill number, extracted value, or fallback
    const billNumber =
      input.vendorBillNumber?.trim() ||
      ex.documentNumber.value ||
      `BILL-${doc._id.toString().slice(-6).toUpperCase()}`;

    // Resolve taxable amount: user override -> extracted taxable -> derived from total -> 0
    let taxablePaise: number;
    if (typeof input.taxablePaise === 'number') {
      taxablePaise = input.taxablePaise;
    } else if (typeof ex.taxablePaise.value === 'number') {
      taxablePaise = ex.taxablePaise.value;
    } else if (typeof ex.totalPaise.value === 'number') {
      taxablePaise = Math.round(ex.totalPaise.value / (1 + input.gstRate / 100));
    } else {
      taxablePaise = 0;
    }

    const dmy = /(\d{2})[/-](\d{2})[/-](\d{4})/.exec(ex.documentDate.value ?? '');
    const bill = await billService.create({
      partyId: input.partyId,
      vendorBillNumber: billNumber,
      billDate: dmy ? new Date(Date.UTC(+dmy[3]!, +dmy[2]! - 1, +dmy[1]!)) : new Date(),
      dueDate: undefined,
      lines: [
        {
          description: `As per ${doc.filename}`,
          qty: 1,
          ratePaise: taxablePaise,
          gstRate: input.gstRate,
          cessRate: 0,
          itcEligible: true,
        },
      ],
      notes: `Created from document ${doc.filename}`,
      recurring: undefined,
    });
    doc.billId = bill._id;
    await doc.save();
    return bill;
  },
};
