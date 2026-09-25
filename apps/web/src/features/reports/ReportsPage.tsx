/**
 * Reports (§32 Phase 17): TB, P&L, Balance Sheet, Cash Flow, AR/AP aging —
 * all as-of a date, all exportable as CSV through the queue. Rendering is
 * shape-generic: any *Paise number becomes ₹ exactly once, here (I1).
 */
import { useState, type ReactNode } from 'react';
import { api, apiBlob, qs } from '../../lib/api';
import { Btn, C, Card, Err, Money, today, useLoad } from '../../lib/ui';

const REPORTS = [
  { key: 'trial-balance', label: 'Trial balance' },
  { key: 'profit-loss', label: 'Profit & loss' },
  { key: 'balance-sheet', label: 'Balance sheet' },
  { key: 'cash-flow', label: 'Cash flow' },
  { key: 'aged-receivables', label: 'AR aging' },
  { key: 'aged-payables', label: 'AP aging' },
] as const;

function isPaiseKey(key: string): boolean {
  return /paise$/i.test(key);
}

function isNumericKey(key: string): boolean {
  return isPaiseKey(key) || /amount|debit|credit|balance|due|days|overdue/i.test(key);
}

/**
 * `totalIncomePaise` → "Total income".
 *
 * The report endpoints return raw field names and the table used to print
 * them verbatim, so a P&L was headed TOTALINCOMEPAISE. The "Paise" suffix is
 * dropped because `cell` has already rendered the value as ₹.
 */
function humanise(key: string): string {
  const words = key
    .replace(/Paise$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function cell(key: string, value: unknown): ReactNode {
  if (typeof value === 'number' && isPaiseKey(key)) return <Money paise={value} />;
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object')
    return <code style={{ fontSize: '0.7rem' }}>{JSON.stringify(value)}</code>;
  if (key === 'bucket') {
    const b = String(value);
    if (b === 'current') return 'Current';
    if (b.startsWith('d')) return `${b.slice(1)}d+`;
    return b;
  }
  if (key === 'type') {
    return <span style={{ textTransform: 'capitalize' }}>{String(value)}</span>;
  }
  return String(value);
}

/** Sort columns so identification/text come first and balances/numbers come last */
function sortColumns(cols: string[]): string[] {
  const priority: Record<string, number> = {
    code: 1,
    number: 2,
    name: 3,
    party: 4,
    type: 5,
    daysOverdue: 6,
    bucket: 7,
    debitPaise: 10,
    creditPaise: 11,
    duePaise: 12,
    balancePaise: 13,
  };
  return [...cols].sort((a, b) => {
    const pA = priority[a] ?? (isNumericKey(a) ? 20 : 15);
    const pB = priority[b] ?? (isNumericKey(b) ? 20 : 15);
    return pA - pB;
  });
}

function getColWidth(col: string): string {
  const c = col.toLowerCase();
  if (c === 'code') return '120px';
  if (c === 'number') return '180px';
  if (c === 'type') return '120px';
  if (c === 'bucket') return '110px';
  if (c === 'daysoverdue') return '130px';
  if (isNumericKey(col)) return '180px';
  return 'auto';
}

/** Consistent table component ensuring all sub-tables align to the exact same column grid */
function ReportTable({
  cols,
  rows,
  reportKey,
}: {
  cols: string[];
  rows: Array<Record<string, unknown>>;
  reportKey?: string;
}) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
          tableLayout: 'fixed',
        }}
      >
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            {cols.map((col) => {
              const isNum = isNumericKey(col);
              const isCenterName =
                reportKey === 'profit-loss' &&
                (col.toLowerCase() === 'name' || col.toLowerCase() === 'party');
              return (
                <th
                  key={col}
                  style={{
                    width: getColWidth(col),
                    textAlign: isNum ? 'right' : isCenterName ? 'center' : 'left',
                    padding: '0.65rem 0.85rem',
                    color: C.muted,
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isCenterName ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                      }}
                    >
                      {humanise(col)}
                    </div>
                  ) : (
                    humanise(col)
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              {cols.map((col) => {
                const isNum = isNumericKey(col);
                const isCenterName =
                  reportKey === 'profit-loss' &&
                  (col.toLowerCase() === 'name' || col.toLowerCase() === 'party');
                return (
                  <td
                    key={col}
                    style={{
                      padding: '0.75rem 0.85rem',
                      textAlign: isNum ? 'right' : isCenterName ? 'center' : 'left',
                      fontVariantNumeric: isNum ? 'tabular-nums' : undefined,
                      color: C.text,
                      whiteSpace: isNum ? 'nowrap' : 'normal',
                    }}
                  >
                    {isCenterName ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                        }}
                      >
                        {cell(col, row[col])}
                      </div>
                    ) : (
                      cell(col, row[col])
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Arrays of objects → aligned tables; scalar maps → KPI cards; recurse. */
function Render({
  value,
  label,
  reportKey,
}: {
  value: unknown;
  label?: string;
  reportKey?: string;
}) {
  if (Array.isArray(value)) {
    const rows = value.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>;
    if (rows.length === 0)
      return (
        <p style={{ color: C.muted, fontSize: '0.85rem', padding: '0.5rem 0 1rem' }}>
          {label ? humanise(label) : 'List'}: nothing recorded in this period
        </p>
      );
    const cols = sortColumns(
      Object.keys(rows[0]!).filter((k) => !['accountId', 'partyId', 'id', '_id'].includes(k)),
    );
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        {label && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '1.5rem',
              marginBottom: '0.5rem',
              paddingBottom: '0.4rem',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <h4
              style={{
                margin: 0,
                color: C.text,
                fontSize: '0.95rem',
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              {humanise(label)}
            </h4>
          </div>
        )}
        <ReportTable cols={cols} rows={rows} reportKey={reportKey} />
      </div>
    );
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const scalars = entries.filter(([, v]) => typeof v !== 'object' || v === null);
    const nested = entries.filter(([, v]) => typeof v === 'object' && v !== null);
    return (
      <div>
        {label && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '1.25rem',
              marginBottom: '0.5rem',
              paddingBottom: '0.4rem',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <h4
              style={{
                margin: 0,
                color: C.text,
                fontSize: '0.95rem',
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              {humanise(label)}
            </h4>
          </div>
        )}
        {scalars.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: '1.5rem',
            }}
          >
            {scalars.map(([k, v]) => {
              const isProfit = /netprofit/i.test(k);
              const isIncome = /totalincome/i.test(k);
              const valColor =
                isProfit && typeof v === 'number'
                  ? v >= 0
                    ? C.green
                    : C.red
                  : isIncome
                    ? C.green
                    : C.text;

              return (
                <div
                  key={k}
                  style={{
                    background: C.panel2,
                    border: 'none',
                    borderRadius: 10,
                    padding: '0.9rem 1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: C.muted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {humanise(k)}
                  </span>
                  <span
                    style={{
                      fontSize: '1.3rem',
                      fontWeight: 700,
                      color: valColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {cell(k, v)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {nested.map(([k, v]) => (
          <Render key={k} value={v} label={k} reportKey={reportKey} />
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export function ReportsPage() {
  const [report, setReport] = useState<(typeof REPORTS)[number]['key']>('profit-loss');
  const [asOf, setAsOf] = useState(today());
  const [exportState, setExportState] = useState('');
  const [error, setError] = useState<unknown>(null);

  const {
    data,
    error: loadError,
    busy,
  } = useLoad(
    () => api<Record<string, unknown>>('GET', `/api/v1/reports/${report}${qs({ asOf })}`),
    [report, asOf],
  );

  async function exportCsv() {
    setError(null);
    setExportState('queueing…');
    try {
      const { jobId } = await api<{ jobId: string }>(
        'POST',
        `/api/v1/reports/${report}/export${qs({ asOf })}`,
        {},
        { idem: false },
      );
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const job = await api<{ status: string; error?: string }>('GET', `/api/v1/jobs/${jobId}`);
        setExportState(`export ${job.status}`);
        if (job.status === 'completed') {
          const csv = await apiBlob(`/api/v1/jobs/${jobId}/download`);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(csv);
          a.download = `${report}-${asOf}.csv`;
          a.click();
          setExportState('');
          return;
        }
        if (job.status === 'failed') throw new Error(job.error ?? 'export failed');
      }
      throw new Error('export timed out');
    } catch (err) {
      setError(err);
      setExportState('');
    }
  }

  return (
    <Card
      title="Reports"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.panel2,
              border: 'none',
              borderRadius: 8,
              padding: '0 0.75rem',
              height: 38,
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: C.muted,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              As of
            </span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                color: C.text,
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </div>
          <Btn
            small
            kind="ghost"
            onClick={() => void exportCsv()}
            disabled={!!exportState}
            style={{
              height: 38,
              padding: '0 1rem',
              fontSize: '0.85rem',
            }}
          >
            {exportState || 'Export CSV'}
          </Btn>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          paddingBottom: '0.85rem',
          marginBottom: '1.25rem',
          borderBottom: 'none',
        }}
      >
        {REPORTS.map((r) => {
          const active = report === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setReport(r.key)}
              className="fp-btn"
              style={{
                height: 36,
                padding: '0 1rem',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontWeight: active ? 600 : 500,
                background: active ? C.accent : C.panel2,
                color: active ? C.accentText : C.muted,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <div>
        <Err error={error} />
        <Err error={loadError} />
        {busy ? <p style={{ color: C.muted }}>Computing…</p> : data && <Render value={data} reportKey={report} />}
      </div>
    </Card>
  );
}

