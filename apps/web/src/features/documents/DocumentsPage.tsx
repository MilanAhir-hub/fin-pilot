/**
 * Documents / OCR (§32 Phase 18): upload a vendor bill as a PDF or photo →
 * the server extracts fields with per-field confidence (never guessed —
 * low confidence = null) → a human reviews and creates the bill draft.
 */
import { useMemo, useState } from 'react';
import { api, fileToBase64 } from '../../lib/api';
import { Badge, Btn, C, Card, Dropdown, Err, Field, Money, Row, S, Tbl, useLoad } from '../../lib/ui';

interface Extracted<T> {
  value: T | null;
  confidence: number;
  status?: 'valid' | 'not_found' | 'review';
  optional?: boolean;
}
interface Doc {
  id: string;
  filename: string;
  status: 'uploaded' | 'extracted' | 'failed';
  extractedBy: 'text-layer' | 'vision' | null;
  costPaise: number;
  billId: string | null;
  extraction: {
    vendorName: Extracted<string>;
    gstin: Extracted<string>;
    documentNumber: Extracted<string>;
    documentDate: Extracted<string>;
    totalPaise: Extracted<number>;
    taxablePaise: Extracted<number>;
    arithmeticOk: boolean | null;
  } | null;
}
interface Party {
  id: string;
  name: string;
  type: string[];
}

function ConfidenceCell({
  field,
  money,
  optional,
}: {
  field?: Extracted<unknown>;
  money?: boolean;
  optional?: boolean;
}) {
  if (!field) {
    return <span style={{ color: C.muted, fontSize: '0.8rem' }}>—</span>;
  }
  const isOptional = field.optional ?? optional;
  const isNotFound =
    field.status === 'not_found' || (field.value === null && field.confidence === 0);
  const isReview =
    field.status === 'review' || (field.confidence > 0 && field.confidence < 0.7);

  if (isNotFound) {
    return (
      <span style={{ color: C.muted, fontSize: '0.8rem' }}>
        Not found {isOptional ? <span style={{ opacity: 0.8 }}>(optional)</span> : ''}
      </span>
    );
  }

  if (isReview || field.value === null) {
    return (
      <span>
        <span
          style={{
            display: 'inline-block',
            padding: '1px 6px',
            fontSize: '0.68rem',
            fontWeight: 600,
            borderRadius: '4px',
            backgroundColor: '#fef3c7',
            color: '#b45309',
            marginRight: 6,
          }}
        >
          Review
        </span>
        {field.value !== null && (
          <span style={{ marginRight: 4 }}>
            {money ? <Money paise={field.value as number} /> : String(field.value)}
          </span>
        )}
        <span style={{ color: C.amber, fontSize: '0.7rem' }}>
          ({Math.round(field.confidence * 100)}%)
        </span>
      </span>
    );
  }

  const color = field.confidence >= 0.9 ? C.green : C.amber;
  return (
    <span>
      {money ? <Money paise={field.value as number} /> : String(field.value)}{' '}
      <span style={{ color, fontSize: '0.7rem' }}>({Math.round(field.confidence * 100)}%)</span>
    </span>
  );
}

export function DocumentsPage() {
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  // Everything uploaded for this company, not just this browser session —
  // a refresh used to hide every document that had already been extracted.
  const saved = useLoad(() => api<{ documents: Doc[] }>('GET', '/api/v1/documents'));
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [manualBillNumber, setManualBillNumber] = useState<Record<string, string>>({});
  const [manualTaxable, setManualTaxable] = useState<Record<string, string>>({});

  const vendors = (parties.data?.parties ?? []).filter((p) => p.type.includes('vendor'));

  // Session uploads first (freshest), then everything already on the server.
  // A document present in both is shown from `docs`, which holds the newer copy.
  const allDocs = useMemo(() => {
    const inSession = new Set(docs.map((d) => d.id));
    return [...docs, ...(saved.data?.documents ?? []).filter((d) => !inSession.has(d.id))];
  }, [docs, saved.data]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { document } = await api<{ document: Doc }>('POST', '/api/v1/documents', {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      });
      let doc = document;
      // extraction may be async — poll until it settles
      for (let i = 0; i < 10 && doc.status === 'uploaded'; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        doc = (await api<{ document: Doc }>('GET', `/api/v1/documents/${document.id}`)).document;
      }
      setDocs((d) => [doc, ...d]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function createBill(doc: Doc) {
    setError(null);
    try {
      const overrideBillNo = manualBillNumber[doc.id]?.trim();
      const overrideTaxable = manualTaxable[doc.id]?.trim();
      await api('POST', `/api/v1/bills/from-document/${doc.id}`, {
        partyId,
        gstRate: Number(gstRate),
        ...(overrideBillNo ? { vendorBillNumber: overrideBillNo } : {}),
        ...(overrideTaxable && !isNaN(Number(overrideTaxable))
          ? { taxablePaise: Math.round(Number(overrideTaxable) * 100) }
          : {}),
      });
      const fresh = (await api<{ document: Doc }>('GET', `/api/v1/documents/${doc.id}`)).document;
      setDocs((d) => [fresh, ...d.filter((x) => x.id !== doc.id)]);
    } catch (err) {
      setError(err);
    }
  }

  async function deleteDoc(id: string) {
    setError(null);
    try {
      await api('DELETE', `/api/v1/documents/${id}`);
      setDocs((d) => d.filter((x) => x.id !== id));
      saved.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <Card title="Upload a vendor bill — PDF or photo">
        <p style={{ color: C.muted, fontSize: '0.85rem' }}>
          A clean PDF with a text layer costs ₹0 to read; photos go through vision OCR. Every
          extracted field carries a confidence — a low-confidence field is{' '}
          <b>null, never guessed</b>. You confirm before any entry exists.
        </p>
        <input
          type="file"
          accept="application/pdf,image/*"
          style={{ color: C.text }}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        {busy && <p style={{ color: C.muted }}>Uploading & extracting…</p>}
        <Err error={error} />
      </Card>

      {allDocs.map((doc) => (
        <Card
          key={doc.id}
          title={
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <span>
                {doc.filename} <Badge value={doc.status} />{' '}
                {doc.extractedBy && (
                  <span style={{ color: C.muted, fontSize: '0.75rem' }}>
                    via {doc.extractedBy} · extraction cost <Money paise={doc.costPaise} />
                  </span>
                )}
              </span>
              <Btn
                kind="ghost"
                small
                style={{ color: C.red, fontSize: '0.75rem' }}
                onClick={() => void deleteDoc(doc.id)}
              >
                Remove
              </Btn>
            </div>
          }
        >
          {doc.extraction ? (
            <>
              <Tbl
                head={['Vendor', 'GSTIN', 'Bill no.', 'Date', 'Taxable', 'Total', 'Arithmetic']}
                rows={[
                  [
                    <ConfidenceCell key="v" field={doc.extraction.vendorName} />,
                    <ConfidenceCell key="g" field={doc.extraction.gstin} optional />,
                    <ConfidenceCell key="n" field={doc.extraction.documentNumber} optional />,
                    <ConfidenceCell key="d" field={doc.extraction.documentDate} optional />,
                    <ConfidenceCell key="x" field={doc.extraction.taxablePaise} money optional />,
                    <ConfidenceCell key="t" field={doc.extraction.totalPaise} money />,
                    doc.extraction.arithmeticOk === null
                      ? '—'
                      : doc.extraction.arithmeticOk
                        ? '✓ adds up'
                        : '✗ mismatch (review)',
                  ],
                ]}
              />
              {doc.billId ? (
                <p style={{ color: C.green, fontSize: '0.85rem' }}>
                  ✓ Bill draft created — review it under Purchases.
                </p>
              ) : (
                <Row>
                  <Field label="Vendor (confirm the match)">
                    <Dropdown
                      style={S.input}
                      value={partyId}
                      onChange={setPartyId}
                      placeholder="— pick vendor —"
                      options={vendors.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Field>
                  <Field label="GST %">
                    <Dropdown
                      style={{ ...S.input, width: 85 }}
                      value={gstRate}
                      onChange={setGstRate}
                      options={['0', '5', '18', '40'].map((r) => ({ value: r, label: `${r}%` }))}
                    />
                  </Field>
                  {!doc.extraction.documentNumber.value && (
                    <Field label="Bill no. (optional)">
                      <input
                        style={{ ...S.input, width: 140 }}
                        placeholder="Auto / optional"
                        value={manualBillNumber[doc.id] ?? ''}
                        onChange={(e) =>
                          setManualBillNumber((m) => ({ ...m, [doc.id]: e.target.value }))
                        }
                      />
                    </Field>
                  )}
                  {!doc.extraction.taxablePaise.value && (
                    <Field label="Taxable ₹ (optional)">
                      <input
                        type="number"
                        style={{ ...S.input, width: 120 }}
                        placeholder={
                          doc.extraction.totalPaise.value ? 'Derived from total' : '0.00'
                        }
                        value={manualTaxable[doc.id] ?? ''}
                        onChange={(e) =>
                          setManualTaxable((m) => ({ ...m, [doc.id]: e.target.value }))
                        }
                      />
                    </Field>
                  )}
                  <Btn disabled={!partyId} onClick={() => void createBill(doc)}>
                    Create bill draft from this document
                  </Btn>
                </Row>
              )}
            </>
          ) : (
            <p style={{ color: doc.status === 'failed' ? C.red : C.muted }}>
              {doc.status === 'failed'
                ? 'Extraction failed — enter the bill manually under Purchases.'
                : 'Awaiting extraction…'}
            </p>
          )}
        </Card>
      ))}
      {allDocs.length === 0 && !saved.busy && (
        <p style={{ color: C.muted, fontSize: '0.85rem' }}>
          No documents yet — upload a PDF or a photo of a vendor bill above.
        </p>
      )}
    </div>
  );
}
