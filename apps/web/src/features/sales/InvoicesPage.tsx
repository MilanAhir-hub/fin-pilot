/**
 * Invoicing (§32 Phase 7): draft → issue (gapless number + GL posting) →
 * send / cancel. Totals are SERVER-computed (I5) — this form only ever sends
 * qty, rate and GST rate.
 */
import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Mail01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { GST_STATE_CODES } from '@finpilot/shared';
import { api } from '../../lib/api';
import {
  Badge,
  Btn,
  C,
  Card,
  Err,
  Field,
  Money,
  Row,
  S,
  Tbl,
  dateStr,
  Dropdown,
  rupeesToPaise,
  today,
  useLoad,
} from '../../lib/ui';

interface InvoiceLineItem {
  description: string;
  hsn?: string;
  qty: number;
  ratePaise: number;
  discountPercent?: number;
  taxablePaise: number;
  gstRate: number;
  cessRate?: number;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  cessPaise?: number;
  lineTotalPaise: number;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  series?: string;
  partySnapshot: {
    name: string;
    gstin?: string | null;
    address?: unknown;
    stateCode?: string | null;
  };
  issueDate: string;
  dueDate: string;
  status: string;
  placeOfSupplyStateCode?: string;
  supplyType?: string;
  reverseCharge?: boolean;
  grandTotalPaise: number;
  amountDuePaise: number;
  amountPaidPaise?: number;
  taxableValuePaise?: number;
  subtotalPaise?: number;
  totalDiscountPaise?: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise?: number;
  roundOffPaise?: number;
  notes?: string;
  termsAndConditions?: string;
  lines?: InvoiceLineItem[];
  eInvoice?: {
    status: string;
    irn?: string | null;
    ackNo?: string | null;
    ackDate?: string | null;
  };
}
interface Party {
  id: string;
  name: string;
  type: string[];
  email?: string;
}

interface Item {
  id: string;
  name: string;
  gstRate: number;
  sellingPricePaise?: number;
  purchasePricePaise?: number;
  unit?: string;
  hsn?: string;
}

interface LineDraft {
  itemId?: string;
  description: string;
  qty: string;
  rateRupees: string;
  gstRate: string;
}

function NewInvoice({
  parties,
  items = [],
  existingInvoices = [],
  onDone,
}: {
  parties: Party[];
  items?: Item[];
  existingInvoices?: InvoiceRow[];
  onDone: () => void;
}) {
  const [partyId, setPartyId] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [lines, setLines] = useState<LineDraft[]>([
    { itemId: '', description: '', qty: '1', rateRupees: '', gstRate: '18' },
  ]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const customers = parties.filter((p) => p.type.includes('customer'));

  const itemOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: '', label: '— Select existing item —' },
    ];
    for (const it of items) {
      const price =
        it.sellingPricePaise && it.sellingPricePaise > 0
          ? it.sellingPricePaise
          : it.purchasePricePaise && it.purchasePricePaise > 0
            ? it.purchasePricePaise
            : null;
      const priceStr =
        price !== null
          ? ` · ₹${(price / 100).toFixed(2).replace(/\.00$/, '')}`
          : '';
      opts.push({
        value: it.id,
        label: `${it.name}${priceStr} (${it.gstRate}%)`,
      });
    }
    return opts;
  }, [items]);

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, j) => j !== i));
  }

  function handleItemSelect(i: number, selectedItemId: string) {
    if (!selectedItemId) {
      setLine(i, { itemId: '' });
      return;
    }
    const it = items.find((item) => item.id === selectedItemId);
    if (!it) return;

    const patch: Partial<LineDraft> = {
      itemId: it.id,
      description: it.name,
      gstRate: String(it.gstRate ?? 18),
    };
    if (it.sellingPricePaise !== undefined && it.sellingPricePaise > 0) {
      patch.rateRupees = (it.sellingPricePaise / 100).toFixed(2).replace(/\.00$/, '');
    } else if (it.purchasePricePaise !== undefined && it.purchasePricePaise > 0) {
      patch.rateRupees = (it.purchasePricePaise / 100).toFixed(2).replace(/\.00$/, '');
    }
    setLine(i, patch);
  }

  function handleCustomerChange(selectedPartyId: string) {
    setPartyId(selectedPartyId);
    if (!selectedPartyId) return;

    // Auto-fill from customer's previous invoice if first line is untouched
    const firstLine = lines[0];
    if (
      lines.length === 1 &&
      firstLine &&
      !firstLine.description &&
      !firstLine.rateRupees &&
      !firstLine.itemId
    ) {
      const cust = parties.find((p) => p.id === selectedPartyId);
      if (cust) {
        const customerInvoices = existingInvoices.filter(
          (inv) => inv.partySnapshot?.name?.toLowerCase() === cust.name.toLowerCase(),
        );
        const pastItemIds = new Set<string>();
        const pastDescs: string[] = [];
        for (const inv of customerInvoices) {
          if (inv.lines) {
            for (const l of inv.lines) {
              const lAny = l as unknown as { itemId?: string };
              if (lAny.itemId) pastItemIds.add(String(lAny.itemId));
              if (l.description) pastDescs.push(l.description);
            }
          }
        }
        let matched = items.find((it) => pastItemIds.has(it.id));
        if (!matched && pastDescs.length > 0) {
          const descLower = new Set(pastDescs.map((d) => d.toLowerCase().trim()));
          matched = items.find((it) => descLower.has(it.name.toLowerCase().trim()));
        }
        if (matched) {
          handleItemSelect(0, matched.id);
        }
      }
    }
  }

  function calculateLineTotal(line: LineDraft) {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rateRupees) || 0;
    const gst = Number(line.gstRate) || 0;
    const taxable = qty * rate;
    const tax = taxable * (gst / 100);
    const total = taxable + tax;
    return total.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Automatically remove/filter out completely empty lines
    const filledLines = lines.filter(
      (l) => l.description.trim() !== '' || l.rateRupees.trim() !== '',
    );

    if (filledLines.length === 0) {
      setError(new Error('Please add at least one line item with a description and rate.'));
      return;
    }

    // Validate that each filled line has description and positive rate
    for (const [idx, l] of filledLines.entries()) {
      if (!l.description.trim()) {
        setError(new Error(`Line ${idx + 1}: Description is required.`));
        return;
      }
      const rateNum = Number(l.rateRupees);
      if (!l.rateRupees.trim() || isNaN(rateNum) || rateNum < 0) {
        setError(new Error(`Line ${idx + 1}: Rate must be a valid positive number.`));
        return;
      }
      const qtyNum = Number(l.qty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setError(new Error(`Line ${idx + 1}: Quantity must be at least 1.`));
        return;
      }
    }

    setBusy(true);
    try {
      await api('POST', '/api/v1/invoices', {
        partyId,
        issueDate,
        lines: filledLines.map((l) => ({
          itemId: l.itemId ? l.itemId : undefined,
          description: l.description.trim(),
          qty: Number(l.qty) || 1,
          ratePaise: rupeesToPaise(l.rateRupees),
          gstRate: Number(l.gstRate),
        })),
      });
      setLines([{ itemId: '', description: '', qty: '1', rateRupees: '', gstRate: '18' }]);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {/* Row 1: Document & Customer Details */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          alignItems: 'flex-start',
          marginBottom: '20px',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--text)',
              marginBottom: 6,
            }}
          >
            Customer
          </label>
          <Dropdown
            style={{
              height: 44,
              background: 'var(--panel-2)',
              border: 'none',
              borderRadius: 9,
              fontSize: '0.88rem',
            }}
            value={partyId}
            onChange={handleCustomerChange}
            placeholder="— Select customer —"
            required
            options={customers.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--text)',
              marginBottom: 6,
            }}
          >
            Issue date
          </label>
          <input
            className="fp-input-modern"
            style={{ width: '100%' }}
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Row 2: Line Items Section */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <label
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Line Items
          </label>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            Select an existing item to auto-fetch selling price and GST %
          </span>
        </div>

        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              background: 'var(--panel-2)',
              borderRadius: 12,
              padding: '16px',
              marginBottom: '12px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Line item header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'rgba(255, 68, 4, 0.15)',
                    color: 'var(--accent, #FF4404)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text)',
                    letterSpacing: '0.01em',
                  }}
                >
                  Item #{i + 1}
                </span>
              </div>
              {lines.length > 1 && (
                <button
                  type="button"
                  title="Remove line"
                  onClick={() => removeLine(i)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    color: 'var(--red, #ef4444)',
                    cursor: 'pointer',
                    padding: '2px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  ✕ Remove
                </button>
              )}
            </div>

            {/* Line Sub-Row 1: Item Dropdown & Description */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 5,
                  }}
                >
                  Existing Item (auto-fills rate & GST)
                </label>
                <Dropdown
                  style={{
                    height: 40,
                    background: 'var(--panel)',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                  }}
                  value={line.itemId || ''}
                  onChange={(val) => handleItemSelect(i, val)}
                  placeholder="— Select existing item —"
                  options={itemOptions}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 5,
                  }}
                >
                  Line description
                </label>
                <input
                  className="fp-input-modern"
                  style={{ height: 40, background: 'var(--panel)', width: '100%' }}
                  value={line.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  placeholder="e.g. Consulting, Laptop, etc."
                  required
                />
              </div>
            </div>

            {/* Line Sub-Row 2: Qty, Rate, GST %, and Line Total Preview */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '80px minmax(110px, 1fr) 100px minmax(130px, 1fr)',
                gap: 12,
                alignItems: 'flex-end',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 5,
                  }}
                >
                  Qty
                </label>
                <input
                  className="fp-input-modern"
                  style={{
                    height: 40,
                    background: 'var(--panel)',
                    textAlign: 'center',
                    width: '100%',
                  }}
                  type="number"
                  min="1"
                  value={line.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 5,
                  }}
                >
                  Rate (₹)
                </label>
                <input
                  className="fp-input-modern"
                  style={{ height: 40, background: 'var(--panel)', width: '100%' }}
                  value={line.rateRupees}
                  onChange={(e) => setLine(i, { rateRupees: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 5,
                  }}
                >
                  GST %
                </label>
                <Dropdown
                  style={{
                    height: 40,
                    background: 'var(--panel)',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                  }}
                  value={line.gstRate}
                  onChange={(val) => setLine(i, { gstRate: val })}
                  options={['0', '5', '12', '18', '28', '40'].map((r) => ({
                    value: r,
                    label: `${r}%`,
                  }))}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 5,
                  }}
                >
                  Total (incl. GST)
                </label>
                <div
                  style={{
                    height: 40,
                    background: 'var(--panel)',
                    borderRadius: 8,
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 600,
                    color: 'var(--accent, #FF4404)',
                    fontSize: '0.88rem',
                  }}
                >
                  ₹{calculateLineTotal(line)}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add line button */}
        <button
          type="button"
          onClick={() =>
            setLines((ls) => [
              ...ls,
              { itemId: '', description: '', qty: '1', rateRupees: '', gstRate: '18' },
            ])
          }
          style={{
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            padding: '8px 16px',
            color: 'var(--accent, #FF4404)',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
        >
          <span>+</span> Add another line
        </button>
      </div>

      <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: '14px' }}>
        Totals, tax split and payable are computed by the server (I5) — nothing you type here is
        trusted as a total.
      </p>

      <Row>
        <Btn disabled={busy}>Create draft</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

export function InvoicesPage() {
  const invoices = useLoad(() => api<{ invoices: InvoiceRow[] }>('GET', '/api/v1/invoices'));
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const items = useLoad(() => api<{ items: Item[] }>('GET', '/api/v1/items'));
  const [error, setError] = useState<unknown>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [emailModal, setEmailModal] = useState<{
    invoiceId: string;
    invoiceNumber: string | null;
    defaultEmail: string;
  } | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedInvoice(null);
    }
    if (selectedInvoice) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedInvoice]);

  async function openInvoiceDetails(inv: InvoiceRow) {
    setSelectedInvoice(inv);
    try {
      const res = await api<{ invoice: InvoiceRow }>('GET', `/api/v1/invoices/${inv.id}`);
      if (res?.invoice) {
        setSelectedInvoice(res.invoice);
      }
    } catch {
      // already have row data as fallback
    }
  }

  async function act(id: string, action: 'issue' | 'cancel' | 'send') {
    setError(null);
    let body: Record<string, unknown> = {};
    if (action === 'cancel') {
      body = { reason: 'cancelled from UI' };
    } else if (action === 'send') {
      const inv =
        selectedInvoice?.id === id
          ? selectedInvoice
          : invoices.data?.invoices.find((i) => i.id === id);
      const party = parties.data?.parties.find((p) => p.name === inv?.partySnapshot?.name);
      setEmailInput(party?.email || '');
      setEmailSuccess(false);
      setEmailModal({
        invoiceId: id,
        invoiceNumber: inv?.invoiceNumber ?? null,
        defaultEmail: party?.email || '',
      });
      return; // modal will handle the actual send
    }
    try {
      await api('POST', `/api/v1/invoices/${id}/${action}`, body);
      invoices.reload();
      if (selectedInvoice && selectedInvoice.id === id) {
        try {
          const res = await api<{ invoice: InvoiceRow }>('GET', `/api/v1/invoices/${id}`);
          if (res?.invoice) setSelectedInvoice(res.invoice);
        } catch {
          setSelectedInvoice(null);
        }
      }
    } catch (err) {
      setError(err);
    }
  }

  async function handleEmailSend() {
    if (!emailModal || !emailInput.trim()) return;
    setEmailSending(true);
    setError(null);
    try {
      await api('POST', `/api/v1/invoices/${emailModal.invoiceId}/send`, {
        email: emailInput.trim(),
      });
      setEmailSuccess(true);
      invoices.reload();
      setTimeout(() => setEmailModal(null), 1800);
    } catch (err) {
      setError(err);
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <div>
      <Card title="New invoice">
        <NewInvoice
          parties={parties.data?.parties ?? []}
          items={items.data?.items ?? []}
          existingInvoices={invoices.data?.invoices ?? []}
          onDone={invoices.reload}
        />
      </Card>
      <Card title="Invoices">
        <Err error={error} />
        <Err error={invoices.error} />
        <Tbl
          head={[
            'Number',
            'Customer',
            'Issued',
            'Due',
            'Status',
            'e-invoice',
            'Total',
            'Due amt',
            'Actions',
          ]}
          rows={(invoices.data?.invoices ?? []).map((inv) => [
            <button
              key="num"
              type="button"
              onClick={() => void openInvoiceDetails(inv)}
              title="Click to view full invoice details"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: C.accent,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              {inv.invoiceNumber ?? <i style={{ color: C.muted }}>draft</i>}
            </button>,
            inv.partySnapshot?.name,
            dateStr(inv.issueDate),
            dateStr(inv.dueDate),
            <Badge key="s" value={inv.status} />,
            inv.eInvoice?.status && inv.eInvoice.status !== 'not_applicable' ? (
              <span key="e" title={inv.eInvoice.irn ?? ''}>
                <Badge value={inv.eInvoice.status} />
              </span>
            ) : (
              '—'
            ),
            <Money key="t" paise={inv.grandTotalPaise} />,
            <Money key="d" paise={inv.amountDuePaise} />,
            <span key="a" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Btn
                small
                iconOnly
                kind="ghost"
                title="View invoice"
                onClick={() => void openInvoiceDetails(inv)}
              >
                <HugeiconsIcon icon={ViewIcon} size={16} />
              </Btn>
              {inv.status === 'draft' && (
                <Btn
                  small
                  iconOnly
                  kind="primary"
                  title="Issue invoice"
                  onClick={() => void act(inv.id, 'issue')}
                >
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} />
                </Btn>
              )}
              {inv.status === 'issued' && (
                <Btn
                  small
                  iconOnly
                  kind="ghost"
                  title="Email invoice"
                  onClick={() => void act(inv.id, 'send')}
                >
                  <HugeiconsIcon icon={Mail01Icon} size={16} />
                </Btn>
              )}
              {(inv.status === 'draft' || inv.status === 'issued') && (
                <Btn
                  small
                  iconOnly
                  kind="danger"
                  title="Cancel invoice"
                  onClick={() => void act(inv.id, 'cancel')}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} />
                </Btn>
              )}
            </span>,
          ])}
        />
      </Card>

      {/* Full Invoice Details Modal */}
      {selectedInvoice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            style={{
              background: C.panel,
              color: C.text,
              border: 'none',
              borderRadius: 16,
              width: '100%',
              maxWidth: 880,
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.8rem',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: 'none',
                paddingBottom: '1.2rem',
                marginBottom: '1.4rem',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
                    {selectedInvoice.invoiceNumber
                      ? `Tax Invoice ${selectedInvoice.invoiceNumber}`
                      : 'Draft Invoice'}
                  </h2>
                  <Badge value={selectedInvoice.status} />
                </div>
                <p style={{ margin: 0, color: C.muted, fontSize: '0.85rem' }}>
                  Series: {selectedInvoice.series || 'INV'} • Place of Supply:{' '}
                  {selectedInvoice.placeOfSupplyStateCode ||
                    selectedInvoice.partySnapshot?.stateCode ||
                    '—'}{' '}
                  {GST_STATE_CODES[
                    selectedInvoice.placeOfSupplyStateCode ||
                    selectedInvoice.partySnapshot?.stateCode ||
                    ''
                  ]
                    ? `(${GST_STATE_CODES[
                    selectedInvoice.placeOfSupplyStateCode ||
                    selectedInvoice.partySnapshot?.stateCode ||
                    ''
                    ]
                    })`
                    : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn small kind="ghost" onClick={() => window.print()}>
                  🖨 Print
                </Btn>
                <button
                  type="button"
                  title="Close (Esc)"
                  onClick={() => setSelectedInvoice(null)}
                  style={{
                    background: C.panel2,
                    border: 'none',
                    borderRadius: 8,
                    color: C.muted,
                    cursor: 'pointer',
                    width: 36,
                    height: 36,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Bill To & Invoice Meta Details */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
                background: C.panel2,
                padding: '1.2rem',
                borderRadius: 12,
                marginBottom: '1.4rem',
                fontSize: '0.88rem',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    color: C.muted,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 6,
                  }}
                >
                  Billed To (Customer)
                </div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', color: C.text }}>
                  {selectedInvoice.partySnapshot?.name}
                </div>
                <div style={{ color: C.muted, marginTop: 4 }}>
                  GSTIN:{' '}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      color: C.text,
                      fontWeight: 500,
                    }}
                  >
                    {selectedInvoice.partySnapshot?.gstin || 'Unregistered'}
                  </span>
                </div>
                <div style={{ color: C.muted, marginTop: 2 }}>
                  State Code: {selectedInvoice.partySnapshot?.stateCode || '—'}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 700,
                    color: C.muted,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 6,
                  }}
                >
                  Invoice Details
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '4px 12px',
                    color: C.muted,
                  }}
                >
                  <span>Issue Date:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {dateStr(selectedInvoice.issueDate)}
                  </span>
                  <span>Due Date:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {dateStr(selectedInvoice.dueDate)}
                  </span>
                  <span>Supply Type:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {selectedInvoice.supplyType === 'intra'
                      ? 'Intra-State (CGST + SGST)'
                      : selectedInvoice.supplyType === 'inter'
                        ? 'Inter-State (IGST)'
                        : selectedInvoice.supplyType || '—'}
                  </span>
                  <span>Reverse Charge:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {selectedInvoice.reverseCharge ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* e-Invoice block if present */}
            {selectedInvoice.eInvoice?.irn && (
              <div
                style={{
                  background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '0.8rem 1rem',
                  marginBottom: '1.4rem',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ fontWeight: 600, color: C.accent, marginBottom: 4 }}>
                  e-Invoice Details
                </div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>
                  IRN: {selectedInvoice.eInvoice.irn}
                </div>
                {selectedInvoice.eInvoice.ackNo && (
                  <div style={{ color: C.muted, marginTop: 2 }}>
                    Ack No: {selectedInvoice.eInvoice.ackNo} • Ack Date:{' '}
                    {dateStr(selectedInvoice.eInvoice.ackDate)}
                  </div>
                )}
              </div>
            )}

            {/* Line Items Table */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
                Line Items
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}
                >
                  <thead>
                    <tr
                      style={{
                        background: C.panel2,
                        textAlign: 'left',
                        borderBottom: `2px solid ${C.border}`,
                      }}
                    >
                      <th style={{ padding: '8px 10px' }}>#</th>
                      <th style={{ padding: '8px 10px' }}>Description</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Taxable</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>GST</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tax</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.lines && selectedInvoice.lines.length > 0 ? (
                      selectedInvoice.lines.map((line, idx) => {
                        const lineTaxPaise =
                          (line.cgstPaise || 0) +
                          (line.sgstPaise || 0) +
                          (line.igstPaise || 0) +
                          (line.cessPaise || 0);
                        return (
                          <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '10px 10px', color: C.muted }}>{idx + 1}</td>
                            <td style={{ padding: '10px 10px' }}>
                              <div style={{ fontWeight: 500 }}>{line.description}</div>
                              {line.hsn && (
                                <div style={{ fontSize: '0.72rem', color: C.muted }}>
                                  HSN/SAC: {line.hsn}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              {line.qty}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <Money paise={line.ratePaise} />
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <Money paise={line.taxablePaise} />
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                              {line.gstRate}%
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <Money paise={lineTaxPaise} />
                            </td>
                            <td
                              style={{
                                padding: '10px 10px',
                                textAlign: 'right',
                                fontWeight: 600,
                              }}
                            >
                              <Money paise={line.lineTotalPaise} />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          style={{ padding: '12px', textAlign: 'center', color: C.muted }}
                        >
                          No line items available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 360,
                  background: C.panel2,
                  padding: '1.2rem',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ color: C.muted }}>Taxable Amount:</span>
                  <Money
                    paise={selectedInvoice.taxableValuePaise ?? selectedInvoice.subtotalPaise}
                  />
                </div>
                {selectedInvoice.cgstPaise > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>CGST:</span>
                    <Money paise={selectedInvoice.cgstPaise} />
                  </div>
                )}
                {selectedInvoice.sgstPaise > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>SGST:</span>
                    <Money paise={selectedInvoice.sgstPaise} />
                  </div>
                )}
                {selectedInvoice.igstPaise > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>IGST:</span>
                    <Money paise={selectedInvoice.igstPaise} />
                  </div>
                )}
                {selectedInvoice.cessPaise ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>Cess:</span>
                    <Money paise={selectedInvoice.cessPaise} />
                  </div>
                ) : null}
                {selectedInvoice.roundOffPaise ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>Round Off:</span>
                    <Money paise={selectedInvoice.roundOffPaise} />
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 8,
                    marginTop: 6,
                    fontWeight: 700,
                    fontSize: '1.05rem',
                  }}
                >
                  <span>Grand Total:</span>
                  <Money paise={selectedInvoice.grandTotalPaise} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 6,
                    fontSize: '0.9rem',
                    color: selectedInvoice.amountDuePaise > 0 ? C.red : C.green,
                    fontWeight: 600,
                  }}
                >
                  <span>Amount Due:</span>
                  <Money
                    paise={selectedInvoice.amountDuePaise}
                    colored={selectedInvoice.amountDuePaise > 0}
                  />
                </div>
              </div>
            </div>

            {/* Notes & Terms if any */}
            {(selectedInvoice.notes || selectedInvoice.termsAndConditions) && (
              <div
                style={{
                  fontSize: '0.82rem',
                  color: C.muted,
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 12,
                  marginBottom: '1.4rem',
                }}
              >
                {selectedInvoice.notes && (
                  <div>
                    <strong>Notes:</strong> {selectedInvoice.notes}
                  </div>
                )}
                {selectedInvoice.termsAndConditions && (
                  <div style={{ marginTop: 4 }}>
                    <strong>Terms & Conditions:</strong> {selectedInvoice.termsAndConditions}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: `1px solid ${C.border}`,
                paddingTop: '1.2rem',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedInvoice.status === 'draft' && (
                  <Btn
                    small
                    onClick={async () => {
                      await act(selectedInvoice.id, 'issue');
                    }}
                  >
                    Issue Invoice
                  </Btn>
                )}
                {selectedInvoice.status === 'issued' && (
                  <>
                    <Btn
                      small
                      kind="ghost"
                      onClick={async () => {
                        await act(selectedInvoice.id, 'send');
                      }}
                    >
                      Email Invoice (PDF)
                    </Btn>
                    <Btn
                      small
                      kind="ghost"
                      onClick={() => {
                        window.open(`/api/v1/invoices/${selectedInvoice.id}/pdf`, '_blank');
                      }}
                    >
                      Download PDF
                    </Btn>
                  </>
                )}
                {(selectedInvoice.status === 'draft' ||
                  selectedInvoice.status === 'issued') && (
                    <Btn
                      small
                      kind="danger"
                      onClick={async () => {
                        await act(selectedInvoice.id, 'cancel');
                      }}
                    >
                      Cancel Invoice
                    </Btn>
                  )}
              </div>
              <Btn kind="ghost" small onClick={() => setSelectedInvoice(null)}>
                Close
              </Btn>
            </div>
          </div>
        </div>
      )}
      {/* Email Invoice Modal */}
      {emailModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.70)',
            backdropFilter: 'blur(6px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !emailSending) setEmailModal(null); }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: '2rem',
              width: '100%',
              maxWidth: 440,
              boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
              animation: 'slideUp 0.25s ease-out',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #FF4404, #ff6b35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 15px rgba(255,68,4,0.4)',
                }}
              >
                <HugeiconsIcon icon={Mail01Icon} size={22} color="#fff" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                  Email Invoice
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                  {emailModal.invoiceNumber ? `Invoice #${emailModal.invoiceNumber} • PDF Attached` : 'Draft invoice'}
                </p>
              </div>
            </div>

            {emailSuccess ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem 0',
                  animation: 'slideUp 0.2s ease-out',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
                <p style={{ margin: 0, color: '#4ade80', fontWeight: 600, fontSize: '1rem' }}>
                  Invoice PDF sent successfully!
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                  PDF document attached and delivered to {emailInput}
                </p>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 68, 4, 0.12)',
                    border: '1px solid rgba(255, 68, 4, 0.25)',
                    marginBottom: 16,
                    fontSize: '0.8rem',
                    color: '#ff8a65',
                  }}
                >
                  <span>📎</span>
                  <span>An official <strong>PDF tax invoice</strong> will be attached to the email.</span>
                </div>
                <label
                  htmlFor="email-invoice-input"
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: 8,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  Recipient Email Address
                </label>
                <input
                  id="email-invoice-input"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="customer@example.com"
                  disabled={emailSending}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleEmailSend();
                    if (e.key === 'Escape') setEmailModal(null);
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.75rem 1rem',
                    borderRadius: 10,
                    border: '1.5px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.07)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    marginBottom: '1.25rem',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#FF4404'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                />

                <Err error={error} />

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    type="button"
                    disabled={emailSending}
                    onClick={() => setEmailModal(null)}
                    style={{
                      padding: '0.6rem 1.2rem',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '0.875rem',
                      cursor: emailSending ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={emailSending || !emailInput.trim()}
                    onClick={() => void handleEmailSend()}
                    style={{
                      padding: '0.6rem 1.4rem',
                      borderRadius: 8,
                      border: 'none',
                      background:
                        emailSending || !emailInput.trim()
                          ? 'rgba(255,68,4,0.4)'
                          : 'linear-gradient(135deg, #FF4404, #ff6b35)',
                      color: '#fff',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: emailSending || !emailInput.trim() ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: emailSending || !emailInput.trim() ? 'none' : '0 4px 15px rgba(255,68,4,0.35)',
                    }}
                  >
                    {emailSending ? (
                      <>
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            border: '2px solid rgba(255,255,255,0.3)',
                            borderTopColor: '#fff',
                            borderRadius: '50%',
                            display: 'inline-block',
                            animation: 'spin 0.6s linear infinite',
                          }}
                        />
                        Sending…
                      </>
                    ) : (
                      <>
                        <HugeiconsIcon icon={Mail01Icon} size={14} />
                        Send Invoice
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
