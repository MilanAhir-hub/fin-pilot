import { useEffect, useState } from 'react';
import { formatINR, toPaise } from '@finpilot/shared';
import { api, RequestError } from '../../lib/api';
import { C, Dropdown } from '../../lib/ui';
import type { AccountRow } from '../accounts/AccountsTree';

// Manual journal vouchers (Phase 5) — post and reverse against the engine.

interface EntryLineDto {
  lineNo: number;
  accountId: string;
  debitPaise: number;
  creditPaise: number;
}

interface EntryDto {
  id: string;
  entryNumber: string;
  date: string;
  narration: string;
  status: 'posted' | 'returned';
  totalDebitPaise: number;
  lines: EntryLineDto[];
  returnedByEntryId: string | null;
}

interface FormLine {
  accountId: string;
  side: 'debit' | 'credit';
  rupees: string;
}

const S: Record<string, React.CSSProperties> = {
  input: {
    padding: '0.4rem 0.6rem',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  },
  button: {
    padding: '0.4rem 0.9rem',
    borderRadius: 8,
    border: 'none',
    background: C.accent,
    color: C.accentText,
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', margin: '0.35rem 0' },
  muted: { color: C.muted },
  error: { color: C.red },
};

export function JournalPage({ accounts }: { accounts: AccountRow[] }) {
  const [entries, setEntries] = useState<EntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [narration, setNarration] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<FormLine[]>([
    { accountId: '', side: 'debit', rupees: '' },
    { accountId: '', side: 'credit', rupees: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const postable = accounts.filter((a) => a.isActive);
  const accountName = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    return account ? `${account.code} ${account.name}` : id.slice(0, 8);
  };

  async function load() {
    try {
      const data = await api<{ entries: EntryDto[] }>('GET', '/api/v1/journal-entries');
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Failed to load journal');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function setLine(i: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        date,
        narration,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debitPaise: l.side === 'debit' ? toPaise(l.rupees || '0') : 0,
          creditPaise: l.side === 'credit' ? toPaise(l.rupees || '0') : 0,
        })),
      };
      await api('POST', '/api/v1/journal-entries', body);
      setNarration('');
      setLines([
        { accountId: '', side: 'debit', rupees: '' },
        { accountId: '', side: 'credit', rupees: '' },
      ]);
      await load();
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Post failed');
    } finally {
      setBusy(false);
    }
  }

  async function reverse(id: string) {
    setError(null);
    try {
      await api('POST', `/api/v1/journal-entries/${id}/return`, { reason: 'returned from UI' });
      await load();
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Return failed');
    }
  }

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleEntry(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Manual journal voucher</h3>
      <form onSubmit={submit}>
        <div style={S.row}>
          <input
            style={S.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            required
          />
        </div>
        {lines.map((line, i) => (
          <div style={S.row} key={i}>
            <Dropdown
              style={{ ...S.input, height: 38, flex: 1, minWidth: 160 }}
              value={line.accountId}
              onChange={(v) => setLine(i, { accountId: v })}
              placeholder="— account —"
              required
              options={postable.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
            />
            <Dropdown
              style={{ ...S.input, height: 38, width: 85 }}
              value={line.side}
              onChange={(v) => setLine(i, { side: v as FormLine['side'] })}
              options={[
                { value: 'debit', label: 'Dr' },
                { value: 'credit', label: 'Cr' },
              ]}
            />
            <input
              style={{ ...S.input, width: 110 }}
              placeholder="₹0.00"
              value={line.rupees}
              onChange={(e) => setLine(i, { rupees: e.target.value })}
              required
            />
            {lines.length > 2 && (
              <button
                type="button"
                style={{ ...S.button, background: C.red, color: '#fff' }}
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div style={S.row}>
          <button
            type="button"
            style={{
              ...S.button,
              background: C.panel2,
              color: C.text,
              border: `1px solid ${C.border}`,
            }}
            onClick={() =>
              setLines((prev) => [...prev, { accountId: '', side: 'debit', rupees: '' }])
            }
          >
            + line
          </button>
          <button style={S.button} disabled={busy} type="submit">
            {busy ? 'Posting…' : 'Post entry'}
          </button>
        </div>
      </form>
      {error && <p style={S.error}>{error}</p>}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '2rem',
          marginBottom: '0.85rem',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Day book</h3>
        {entries.length > 0 && (
          <button
            type="button"
            className="fp-btn"
            style={{
              background: C.panel2,
              border: 'none',
              color: C.text,
              padding: '0.4rem 0.85rem',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onClick={() => {
              if (expandedIds.size === entries.length) {
                setExpandedIds(new Set());
              } else {
                setExpandedIds(new Set(entries.map((e) => e.id)));
              }
            }}
          >
            {expandedIds.size === entries.length ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      {entries.length === 0 && <p style={S.muted}>No entries yet.</p>}

      {entries.map((entry) => {
        const isExpanded = expandedIds.has(entry.id);
        return (
          <div
            key={entry.id}
            style={{
              border: 'none',
              borderRadius: 12,
              marginBottom: '0.65rem',
              background: C.panel,
              boxShadow: 'var(--shadow)',
              opacity: entry.status === 'returned' ? 0.6 : 1,
              transition: 'background 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              onClick={() => toggleEntry(entry.id)}
              style={{
                padding: '0.75rem 1rem',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  fontSize: '0.7rem',
                  color: C.muted,
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  flexShrink: 0,
                }}
              >
                ▶
              </span>

              <span
                className="fp-mono"
                style={{
                  background: C.panel2,
                  border: 'none',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: C.text,
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.entryNumber}
              </span>

              <span
                style={{
                  fontWeight: 500,
                  color: C.text,
                  fontSize: '0.875rem',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={entry.narration}
              >
                {entry.narration}
              </span>

              <span
                style={{
                  fontSize: '0.72rem',
                  color: C.muted,
                  background: C.panel2,
                  border: 'none',
                  padding: '0.2rem 0.5rem',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.lines.length} {entry.lines.length === 1 ? 'line' : 'lines'}
              </span>

              <span style={{ color: C.muted, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                {new Date(entry.date).toLocaleDateString('en-IN')}
              </span>

              <span
                className="fp-mono"
                style={{
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  color: C.text,
                  minWidth: 100,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatINR(entry.totalDebitPaise)}
              </span>

              {entry.status === 'posted' && !entry.returnedByEntryId ? (
                <button
                  type="button"
                  style={{
                    ...S.button,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: 'none',
                    color: C.red,
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.75rem',
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void reverse(entry.id);
                  }}
                >
                  return
                </button>
              ) : (
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: C.red,
                    border: 'none',
                    background: 'rgba(239, 68, 68, 0.1)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  {entry.status}
                </span>
              )}
            </div>

            {isExpanded && (
              <div
                style={{
                  padding: '0 1rem 0.85rem 2.75rem',
                }}
              >
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: C.panel2,
                    borderRadius: 10,
                    border: 'none',
                    fontSize: '0.84rem',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 140px',
                      gap: 8,
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: C.muted,
                      padding: '0.4rem 0.65rem',
                      background: 'color-mix(in srgb, var(--panel-3) 50%, transparent)',
                      borderRadius: 6,
                      marginBottom: '0.4rem',
                    }}
                  >
                    <span>Side</span>
                    <span>Account</span>
                    <span style={{ textAlign: 'right' }}>Amount</span>
                  </div>
                  {entry.lines.map((l) => (
                    <div
                      key={l.lineNo}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '50px 1fr 140px',
                        gap: 8,
                        alignItems: 'center',
                        padding: '0.35rem 0.65rem',
                        borderBottom: 'none',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          color: l.debitPaise > 0 ? C.green : C.amber,
                        }}
                      >
                        {l.debitPaise > 0 ? 'Dr' : 'Cr'}
                      </span>
                      <span style={{ color: C.text }}>
                        {accountName(l.accountId)}
                      </span>
                      <span
                        className="fp-mono"
                        style={{
                          textAlign: 'right',
                          fontWeight: 500,
                          color: C.text,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatINR(l.debitPaise > 0 ? l.debitPaise : l.creditPaise)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
