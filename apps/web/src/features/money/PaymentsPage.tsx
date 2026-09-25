/** Payments in/out with allocation to invoices/bills (§32 Phase 9). */
import { useState } from 'react';
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

interface PaymentRow {
  id: string;
  direction: 'inflow' | 'outflow';
  partySnapshot?: { name: string };
  date: string;
  amountPaise: number;
  unallocatedPaise?: number;
  method: string;
  reference?: string;
  status?: string;
}
interface Party {
  id: string;
  name: string;
}
interface Account {
  id: string;
  code: string;
  name: string;
}
interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  amountDuePaise: number;
  partyId: string;
}

export function PaymentsPage() {
  const payments = useLoad(() => api<{ payments: PaymentRow[] }>('GET', '/api/v1/payments'));
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const accounts = useLoad(() => api<{ accounts: Account[] }>('GET', '/api/v1/accounts'));
  const invoices = useLoad(() => api<{ invoices: InvoiceRow[] }>('GET', '/api/v1/invoices'));

  const [direction, setDirection] = useState<'inflow' | 'outflow'>('inflow');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const bankish = (accounts.data?.accounts ?? []).filter((a) => ['1110', '1120'].includes(a.code));
  const openInvoices = (invoices.data?.invoices ?? []).filter(
    (inv) =>
      ['issued', 'partially_paid', 'overdue'].includes(inv.status) &&
      (!partyId || inv.partyId === partyId),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const amountPaise = rupeesToPaise(amount);
      const chosen = openInvoices.find((inv) => inv.id === invoiceId);
      await api('POST', '/api/v1/payments', {
        direction,
        partyId,
        date: today(),
        amountPaise,
        method,
        depositAccountId,
        allocations:
          direction === 'inflow' && chosen
            ? [
                {
                  documentModel: 'Invoice',
                  documentId: chosen.id,
                  amountPaise: Math.min(amountPaise, chosen.amountDuePaise),
                },
              ]
            : [],
      });
      setAmount('');
      setInvoiceId('');
      payments.reload();
      invoices.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Card title="Record a payment">
        <form onSubmit={submit}>
          <Row>
            <Field label="Direction">
              <Dropdown
                style={{ ...S.input, minWidth: 200 }}
                value={direction}
                onChange={(v) => setDirection(v as 'inflow' | 'outflow')}
                options={[
                  { value: 'inflow', label: 'inflow (customer pays)' },
                  { value: 'outflow', label: 'outflow (we pay)' },
                ]}
              />
            </Field>
            <Field label="Party">
              <Dropdown
                style={{ ...S.input, minWidth: 180 }}
                value={partyId}
                onChange={setPartyId}
                placeholder="— pick —"
                required
                options={(parties.data?.parties ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
            </Field>
            <Field label="Amount (₹)">
              <input
                style={{ ...S.input, width: 110 }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Method">
              <Dropdown
                style={{ ...S.input, minWidth: 150 }}
                value={method}
                onChange={setMethod}
                options={['bank_transfer', 'cash', 'upi', 'neft', 'rtgs', 'imps', 'cheque', 'card'].map((m) => ({
                  value: m,
                  label: m.replace(/_/g, ' '),
                }))}
              />
            </Field>
            <Field label="Deposit / pay account">
              <Dropdown
                style={{ ...S.input, minWidth: 200 }}
                value={depositAccountId}
                onChange={setDepositAccountId}
                placeholder="— pick —"
                required
                options={bankish.map((a) => ({
                  value: a.id,
                  label: `${a.code} · ${a.name}`,
                }))}
              />
            </Field>
            {direction === 'inflow' && (
              <Field label="Allocate to invoice (optional — rest becomes an advance)">
                <Dropdown
                  style={{ ...S.input, minWidth: 220 }}
                  value={invoiceId}
                  onChange={setInvoiceId}
                  placeholder="— none (advance) —"
                  options={openInvoices.map((inv) => ({
                    value: inv.id,
                    label: inv.invoiceNumber ?? inv.id,
                  }))}
                />
              </Field>
            )}
            <Btn disabled={busy}>Record</Btn>
          </Row>
          <Err error={error} />
          <p style={{ color: C.muted, fontSize: '0.75rem' }}>
            Allocations never exceed the payment; an unallocated inflow is an advance (GST on
            advances applies, §12.2).
          </p>
        </form>
      </Card>
      <Card title="Payments">
        <Err error={payments.error} />
        <Tbl
          head={['Date', 'Direction', 'Party', 'Method', 'Reference', 'Amount']}
          rows={(payments.data?.payments ?? []).map((p) => [
            dateStr(p.date),
            <Badge key="d" value={p.direction} />,
            p.partySnapshot?.name ?? '—',
            p.method,
            p.reference ?? '—',
            <Money key="a" paise={p.amountPaise} />,
          ])}
        />
      </Card>
    </div>
  );
}
