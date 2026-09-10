/**
 * Vendor bills + expenses with approval (§32 Phase 8). Approving a bill posts
 * ITC through the ledger; no self-approval — the server enforces both.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatINR } from '@finpilot/shared';
import { api } from '../../lib/api';
import {
  Err,
  dateStr,
  rupeesToPaise,
  today,
  useLoad,
} from '../../lib/ui';
import { Dropdown } from '../../components/Dropdown';

interface BillRow {
  id: string;
  vendorBillNumber: string;
  partySnapshot?: { name: string };
  billDate: string;
  status: string;
  grandTotalPaise: number;
  itcEligiblePaise?: number;
}
interface ExpenseRow {
  id: string;
  date: string;
  description: string;
  amountPaise: number;
  status: string;
}
interface Party {
  id: string;
  name: string;
  type: string[];
}
interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

function getVendorCategory(name: string, party?: Party): string {
  if (party && party.type && party.type.length > 1) {
    const customType = party.type.find((t) => t !== 'vendor');
    if (customType) return customType.charAt(0).toUpperCase() + customType.slice(1);
  }
  const lower = (name || '').toLowerCase();
  if (lower.includes('power') || lower.includes('electric')) return 'Utilities';
  if (lower.includes('packag')) return 'Packaging';
  if (lower.includes('logistic') || lower.includes('transport')) return 'Transport';
  if (lower.includes('tech') || lower.includes('software')) return 'Technology';
  return 'Services';
}

function StatusPill({ status }: { status: string }) {
  const isApproved = status === 'approved';
  const isPending = status === 'pending_approval';
  const isCancelled = status === 'cancelled' || status === 'rejected';

  const style: React.CSSProperties = isApproved
    ? {
        background: 'rgba(16, 185, 129, 0.12)',
        border: 'none',
        color: '#10B981',
      }
    : isPending
      ? {
          background: 'rgba(245, 158, 11, 0.12)',
          border: 'none',
          color: '#F59E0B',
        }
      : isCancelled
        ? {
            background: 'rgba(239, 68, 68, 0.12)',
            border: 'none',
            color: '#EF4444',
          }
        : {
            background: 'var(--panel-2)',
            border: 'none',
            color: 'var(--muted)',
          };

  const label =
    status === 'approved'
      ? 'Approved'
      : status === 'pending_approval'
        ? 'Pending'
        : status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 12px',
        borderRadius: 9999,
        fontSize: '0.75rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function ActionMenu({
  items,
}: {
  items: Array<{
    label: string;
    onClick: () => void;
    danger?: boolean;
    success?: boolean;
    icon?: React.ReactNode;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (items.length === 0) return <span style={{ color: 'var(--muted)' }}>—</span>;

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="fp-action-btn"
        title="Actions"
        aria-label="Actions"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="12" cy="5" r="1.2" />
          <circle cx="12" cy="19" r="1.2" />
        </svg>
      </button>
      {open && (
        <div className="fp-action-popover">
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className={`fp-popover-item ${item.danger ? 'danger' : item.success ? 'success' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewBill({
  vendors,
  onDone,
  formRef,
}: {
  vendors: Party[];
  onDone: () => void;
  formRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [partyId, setPartyId] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setPartyId('');
    setNumber('');
    setDate(today());
    setDescription('');
    setAmount('');
    setGstRate('18');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/bills', {
        partyId,
        vendorBillNumber: number,
        billDate: date,
        lines: [
          { description, qty: 1, ratePaise: rupeesToPaise(amount), gstRate: Number(gstRate) },
        ],
      });
      setNumber('');
      setDescription('');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={formRef}
      id="record-bill-section"
      style={{
        background: 'var(--panel)',
        border: 'none',
        borderRadius: 14,
        padding: '24px',
        marginBottom: '32px',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Form Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: '22px',
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: 'rgba(255, 68, 4, 0.12)',
            border: 'none',
            color: '#FF4404',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        </div>
        <div>
          <div
            style={{
              fontSize: '1.02rem',
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
            }}
          >
            Record a new bill
          </div>
          <div style={{ fontSize: '0.83rem', color: 'var(--muted)', marginTop: 2 }}>
            Add vendor bill details to keep your records up to date.
          </div>
        </div>
      </div>

      {vendors.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 16 }}>
          Add a vendor under Parties first.
        </p>
      )}

      <form onSubmit={submit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 16,
            alignItems: 'flex-end',
            marginBottom: '20px',
          }}
        >
          {/* Vendor */}
          <div style={{ minWidth: 170 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Vendor
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
              onChange={setPartyId}
              placeholder="— Select vendor —"
              required
              options={vendors.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>

          {/* Vendor bill no. */}
          <div style={{ minWidth: 120 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Vendor bill no.
            </label>
            <input
              className="fp-input-modern"
              placeholder="e.g. INV-001"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
            />
          </div>

          {/* Bill date */}
          <div style={{ minWidth: 130 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Bill date
            </label>
            <input
              className="fp-input-modern"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Description (optional) */}
          <div style={{ minWidth: 170, flex: 1.5 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Description (optional)
            </label>
            <input
              className="fp-input-modern"
              placeholder="e.g. Electricity bill"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Taxable amount (₹) */}
          <div style={{ minWidth: 110 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Taxable amount (₹)
            </label>
            <input
              className="fp-input-modern"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          {/* GST % */}
          <div style={{ minWidth: 90 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              GST %
            </label>
            <Dropdown
              style={{
                height: 44,
                background: 'var(--panel-2)',
                border: 'none',
                borderRadius: 9,
                fontSize: '0.88rem',
              }}
              value={gstRate}
              onChange={setGstRate}
              options={['0', '5', '18', '40'].map((r) => ({ value: r, label: `${r}%` }))}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={resetForm}
            style={{
              background: 'var(--panel-3)',
              border: 'none',
              color: 'var(--text)',
              height: 42,
              padding: '0 20px',
              borderRadius: 9,
              fontSize: '0.88rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              background: '#FF4404',
              border: 'none',
              color: '#FFFFFF',
              height: 42,
              padding: '0 22px',
              borderRadius: 9,
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(255, 68, 4, 0.25)',
            }}
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = '#E03B00';
            }}
            onMouseLeave={(e) => {
              if (!busy) e.currentTarget.style.background = '#FF4404';
            }}
          >
            Record bill
          </button>
        </div>
      </form>
      <Err error={error} />
    </div>
  );
}

function NewExpense({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const expenseAccounts = accounts.filter((a) => a.type === 'expense');

  function resetForm() {
    setAccountId('');
    setDescription('');
    setAmount('');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/expenses', {
        date: today(),
        amountPaise: rupeesToPaise(amount),
        expenseAccountId: accountId,
        description,
      });
      setDescription('');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
          alignItems: 'flex-end',
          marginBottom: 16,
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
            Expense account
          </label>
          <Dropdown
            style={{
              height: 44,
              background: 'var(--panel-2)',
              border: 'none',
              borderRadius: 9,
              fontSize: '0.88rem',
            }}
            value={accountId}
            onChange={setAccountId}
            placeholder="— Select account —"
            required
            options={expenseAccounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
          />
        </div>
        <div style={{ flex: 1.5 }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--text)',
              marginBottom: 6,
            }}
          >
            Description
          </label>
          <input
            className="fp-input-modern"
            placeholder="e.g. Office supplies"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
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
            Amount (₹)
          </label>
          <input
            className="fp-input-modern"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          type="button"
          onClick={resetForm}
          style={{
            background: 'var(--panel-2)',
            border: 'none',
            color: 'var(--text)',
            height: 40,
            padding: '0 18px',
            borderRadius: 8,
            fontSize: '0.86rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          style={{
            background: 'var(--panel-3)',
            border: 'none',
            color: 'var(--text)',
            height: 40,
            padding: '0 20px',
            borderRadius: 8,
            fontSize: '0.86rem',
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          Submit expense
        </button>
      </div>
      <Err error={error} />
    </form>
  );
}

export function BillsPage() {
  const bills = useLoad(() => api<{ bills: BillRow[] }>('GET', '/api/v1/bills'));
  const expenses = useLoad(() => api<{ expenses: ExpenseRow[] }>('GET', '/api/v1/expenses'));
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const accounts = useLoad(() => api<{ accounts: Account[] }>('GET', '/api/v1/accounts'));
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const newBillRef = useRef<HTMLDivElement>(null);

  async function act(kind: 'bills' | 'expenses', id: string, action: string, body: unknown = {}) {
    setError(null);
    try {
      await api('POST', `/api/v1/${kind}/${id}/${action}`, body);
      (kind === 'bills' ? bills : expenses).reload();
    } catch (err) {
      setError(err);
    }
  }

  const vendors = (parties.data?.parties ?? []).filter((p) => p.type.includes('vendor'));
  const partiesList = parties.data?.parties ?? [];

  // Filter bills client-side based on search query
  const filteredBills = useMemo(() => {
    const list = bills.data?.bills ?? [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((b) => {
      const num = (b.vendorBillNumber || '').toLowerCase();
      const vendor = (b.partySnapshot?.name || '').toLowerCase();
      return num.includes(q) || vendor.includes(q);
    });
  }, [bills.data?.bills, searchQuery]);

  function scrollToNewBill() {
    newBillRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Err error={error} />

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.025em',
            }}
          >
            Bills & expenses
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '0.88rem',
              color: 'var(--muted)',
            }}
          >
            Record and manage your vendor bills
          </p>
        </div>

        {/* Primary "+ New bill" CTA button */}
        <button
          type="button"
          onClick={scrollToNewBill}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: '#FF4404',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 10,
            padding: '0.62rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(255, 68, 4, 0.28)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#E03B00')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#FF4404')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New bill</span>
        </button>
      </div>

      {/* "Record a new bill" Section */}
      <NewBill vendors={vendors} onDone={bills.reload} formRef={newBillRef} />

      {/* "Vendor bills" Section */}
      <div style={{ marginBottom: '40px' }}>
        {/* Section Header & Toolbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.2rem',
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.015em',
              }}
            >
              Vendor bills
            </h2>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: '0.84rem',
                color: 'var(--muted)',
              }}
            >
              All recorded vendor bills. Approved bills are automatically posted to the ledger and ITC.
            </p>
          </div>

          {/* Search and Filter */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: 9,
                padding: '0 12px',
                height: 38,
                minWidth: 280,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.6 }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search by vendor, bill no. or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: '0.84rem',
                  width: '100%',
                  fontFamily: 'inherit',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border)',
                borderRadius: 9,
                padding: '0 14px',
                height: 38,
                color: 'var(--text)',
                fontSize: '0.84rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.7 }}
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>Filter</span>
            </button>
          </div>
        </div>

        <Err error={bills.error} />

        {/* Minimal Subtle Table Surface */}
        <div
          style={{
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="fp-modern-table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Bill no.</th>
                  <th style={{ width: '32%' }}>Vendor</th>
                  <th style={{ width: '18%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Date
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ opacity: 0.5 }}
                      >
                        <polyline points="7 15 12 20 17 15" />
                        <polyline points="7 9 12 4 17 9" />
                      </svg>
                    </span>
                  </th>
                  <th style={{ width: '15%' }}>Status</th>
                  <th style={{ width: '14%' }}>Amount (₹)</th>
                  <th style={{ width: '6%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: '32px 16px',
                        textAlign: 'center',
                        color: 'var(--muted)',
                        fontSize: '0.88rem',
                      }}
                    >
                      {searchQuery ? 'No vendor bills match your search.' : 'No recorded bills yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => {
                    const party = partiesList.find((p) => p.name === b.partySnapshot?.name);
                    const vendorName = b.partySnapshot?.name ?? '—';
                    const category = getVendorCategory(vendorName, party);

                    const actionItems: Array<{
                      label: string;
                      onClick: () => void;
                      danger?: boolean;
                      success?: boolean;
                      icon?: React.ReactNode;
                    }> = [];

                    if (b.status === 'pending_approval') {
                      actionItems.push({
                        label: 'Approve',
                        success: true,
                        onClick: () => void act('bills', b.id, 'approve'),
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ),
                      });
                    }

                    if (b.status === 'pending_approval' || b.status === 'approved') {
                      actionItems.push({
                        label: 'Cancel',
                        danger: true,
                        onClick: () =>
                          void act('bills', b.id, 'cancel', { reason: 'cancelled from UI' }),
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        ),
                      });
                    }

                    return (
                      <tr key={b.id}>
                        {/* Bill No */}
                        <td style={{ color: 'var(--muted)', fontSize: '0.86rem' }}>
                          {b.vendorBillNumber}
                        </td>

                        {/* Vendor Name + Category */}
                        <td>
                          <div
                            style={{
                              fontWeight: 500,
                              color: 'var(--text)',
                              fontSize: '0.9rem',
                            }}
                          >
                            {vendorName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.74rem',
                              color: 'var(--muted)',
                              marginTop: 2,
                            }}
                          >
                            {category}
                          </div>
                        </td>

                        {/* Date */}
                        <td style={{ color: 'var(--text)', fontSize: '0.86rem' }}>
                          {dateStr(b.billDate)}
                        </td>

                        {/* Status */}
                        <td>
                          <StatusPill status={b.status} />
                        </td>

                        {/* Amount */}
                        <td>
                          <span
                            className="fp-mono"
                            style={{
                              fontWeight: 600,
                              color: 'var(--text)',
                              fontSize: '0.92rem',
                            }}
                          >
                            {formatINR(b.grandTotalPaise)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <ActionMenu items={actionItems} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* "Expenses" Section */}
      <div
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '24px',
          marginBottom: '32px',
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '1.15rem',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Expenses
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.83rem', color: 'var(--muted)' }}>
            Multi-step approval; no self-approval.
          </p>
        </div>

        <NewExpense accounts={accounts.data?.accounts ?? []} onDone={expenses.reload} />

        <Err error={expenses.error} />

        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table className="fp-modern-table">
            <thead>
              <tr>
                <th style={{ width: '20%' }}>Date</th>
                <th style={{ width: '40%' }}>Description</th>
                <th style={{ width: '20%' }}>Amount (₹)</th>
                <th style={{ width: '15%' }}>Status</th>
                <th style={{ width: '5%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(expenses.data?.expenses ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: '24px 16px',
                      textAlign: 'center',
                      color: 'var(--muted)',
                      fontSize: '0.86rem',
                    }}
                  >
                    No expenses recorded yet.
                  </td>
                </tr>
              ) : (
                (expenses.data?.expenses ?? []).map((x) => {
                  const expenseActions: Array<{
                    label: string;
                    onClick: () => void;
                    danger?: boolean;
                    success?: boolean;
                    icon?: React.ReactNode;
                  }> = [];

                  if (x.status === 'pending_approval') {
                    expenseActions.push({
                      label: 'Approve',
                      success: true,
                      onClick: () => void act('expenses', x.id, 'approve'),
                      icon: (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ),
                    });
                    expenseActions.push({
                      label: 'Reject',
                      danger: true,
                      onClick: () =>
                        void act('expenses', x.id, 'reject', { reason: 'rejected from UI' }),
                      icon: (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      ),
                    });
                  }

                  return (
                    <tr key={x.id}>
                      <td style={{ color: 'var(--text)', fontSize: '0.86rem' }}>
                        {dateStr(x.date)}
                      </td>
                      <td style={{ color: 'var(--text)', fontWeight: 500 }}>{x.description}</td>
                      <td>
                        <span
                          className="fp-mono"
                          style={{
                            fontWeight: 600,
                            color: 'var(--text)',
                            fontSize: '0.92rem',
                          }}
                        >
                          {formatINR(x.amountPaise)}
                        </span>
                      </td>
                      <td>
                        <StatusPill status={x.status} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <ActionMenu items={expenseActions} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
