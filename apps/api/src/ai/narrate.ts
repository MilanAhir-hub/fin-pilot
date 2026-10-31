/**
 * Financial Data Narrator:
 * Formats raw accounting data, ledger reports, GST summaries, and balance figures
 * into clean, human-readable sentences with Indian Rupee (INR) currency formatting.
 */
import { formatINR } from '@finpilot/shared';

type Dict = Record<string, unknown>;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isArr = (v: unknown): v is Dict[] => Array.isArray(v);

/** formatINR asserts an integer; a tool could hand us a float or a bad value. */
function inr(paise: unknown): string {
  if (!isNum(paise)) return '—';
  try {
    return formatINR(Math.trunc(paise));
  } catch {
    return '—';
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function dateStr(v: unknown): string {
  if (typeof v !== 'string' && !(v instanceof Date)) return '';
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A short bulleted list, capped so a long ledger does not fill the chat. */
function list(lines: string[], cap = 8): string {
  const shown = lines.slice(0, cap);
  const rest = lines.length - shown.length;
  return shown.map((l) => `• ${l}`).join('\n') + (rest > 0 ? `\n…and ${rest} more.` : '');
}

/**
 * @returns prose for a known shape, or null when the caller should fall back.
 */
export function narrateToolResult(res: Dict): string | null {
  // ── write tools: a proposal, never an executed write (I10) ────────────────
  if (res.proposalId) {
    const label =
      res.type === 'invoice'
        ? 'invoice draft'
        : res.type === 'journal_entry'
          ? 'journal entry'
          : 'action';
    return `I have drafted the ${label} proposal for your confirmation. Review and confirm it in the Proposal inbox below — nothing is posted until you do.`;
  }

  // ── company / organization profile ────────────────────────────────────────
  if (res.company && typeof res.company === 'object') {
    const c = res.company as Dict;
    const o = (res.organization ?? null) as Dict | null;
    const parts = [`You are working on the books of **${String(c.tradeName || c.legalName)}**.`];
    if (c.gstin) parts.push(`GSTIN ${String(c.gstin)}.`);
    if (c.pan) parts.push(`PAN ${String(c.pan)}.`);
    if (c.gstRegistrationType) parts.push(`Registration type: ${String(c.gstRegistrationType)}.`);
    if (c.stateCode) parts.push(`State code ${String(c.stateCode)}.`);
    if (c.currency) parts.push(`Books are kept in ${String(c.currency)}.`);
    if (o) parts.push(`It belongs to the organization ${String(o.name)} on the ${String(o.plan)} plan.`);
    return parts.join(' ');
  }

  // ── profit & loss ─────────────────────────────────────────────────────────
  if (isNum(res.totalIncomePaise) && isNum(res.totalExpensesPaise)) {
    const net = isNum(res.netProfitPaise) ? res.netProfitPaise : res.totalIncomePaise - res.totalExpensesPaise;
    const label = net >= 0 ? 'net profit' : 'net loss';
    return [
      `Income: ${inr(res.totalIncomePaise)}`,
      `Expenses: ${inr(res.totalExpensesPaise)}`,
      `Your ${label} is ${inr(Math.abs(net))}.`,
    ].join('\n');
  }
  if (isNum(res.totalIncomePaise)) {
    return res.totalIncomePaise === 0
      ? 'Your total revenue is ₹0.00 — no income has been posted yet.'
      : `Your total revenue is ${inr(res.totalIncomePaise)}.`;
  }
  if (isNum(res.totalExpensesPaise)) {
    return res.totalExpensesPaise === 0
      ? 'Your total expenses are ₹0.00 — no expenses have been posted yet.'
      : `Your total expenses are ${inr(res.totalExpensesPaise)}.`;
  }
  if (isNum(res.netProfitPaise)) {
    const label = res.netProfitPaise >= 0 ? 'net profit' : 'net loss';
    return `Your ${label} is ${inr(Math.abs(res.netProfitPaise))}.`;
  }

  // ── cash position ─────────────────────────────────────────────────────────
  if (isNum(res.balancePaise)) {
    return res.balancePaise === 0
      ? 'Your cash position is ₹0.00 — no cash movements have been recorded.'
      : `Your cash and bank position is ${inr(res.balancePaise)}.`;
  }

  // ── aged receivables / payables ───────────────────────────────────────────
  if (isArr(res.rows) && res.buckets && isNum(res.totalPaise)) {
    const owed = isArr(res.rows) && res.rows.some((r) => 'party' in r);
    const b = res.buckets as Dict;
    const overdue =
      (isNum(b.d30) ? b.d30 : 0) +
      (isNum(b.d60) ? b.d60 : 0) +
      (isNum(b.d90) ? b.d90 : 0) +
      (isNum(b.older) ? b.older : 0);
    const head = `Total outstanding: **${inr(res.totalPaise)}** across ${plural(res.rows.length, 'document')}.`;
    const ageing = [
      `Not yet due: ${inr(b.current)}`,
      `1–30 days: ${inr(b.d30)}`,
      `31–60 days: ${inr(b.d60)}`,
      `61–90 days: ${inr(b.d90)}`,
      `Over 90 days: ${inr(b.older)}`,
    ];
    const items = res.rows.map(
      (r) =>
        `${String(r.number ?? '—')} — ${String(r.party ?? '—')}: ${inr(r.duePaise)}` +
        (isNum(r.daysOverdue) && r.daysOverdue > 0 ? ` (${r.daysOverdue} days overdue)` : ''),
    );
    const tail = overdue > 0 ? `\n\n${inr(overdue)} of this is already overdue.` : '';
    return `${head}\n\n${list(ageing, 5)}\n\n${owed ? 'Documents' : 'Items'}:\n${list(items)}${tail}`;
  }

  // ── balance sheet ─────────────────────────────────────────────────────────
  if (isNum(res.totalAssetsPaise) && isNum(res.totalLiabilitiesPaise)) {
    const bal = res.balances === true ? 'Assets equal liabilities plus equity, so the sheet balances.' : 'The sheet does NOT balance — this needs investigating.';
    return [
      `Assets: ${inr(res.totalAssetsPaise)}`,
      `Liabilities: ${inr(res.totalLiabilitiesPaise)}`,
      `Equity: ${inr(res.totalEquityPaise)}`,
      '',
      bal,
    ].join('\n');
  }

  // ── trial balance (a bare array of accounts) ──────────────────────────────
  if (isArr(res.trialBalance)) return narrateTrialBalance(res.trialBalance);

  // ── health score & forecast ───────────────────────────────────────────────
  if (isNum(res.score)) {
    const drivers = isArr(res.drivers)
      ? '\n\n' + list(res.drivers.map((d) => `${String(d.name ?? d.label ?? 'factor')}: ${String(d.value ?? d.score ?? '')}`))
      : '';
    return `Your business health score is ${res.score} out of 100.${drivers}`;
  }
  if (isArr(res.weeks)) {
    return `I have a ${res.weeks.length}-week cash forecast for you. It projects a low, likely and high case for each week from your posted inflows and outflows.`;
  }

  // ── list tools ────────────────────────────────────────────────────────────
  if (isNum(res.count) && isArr(res.invoices)) {
    if (res.count === 0) return 'There are no invoices matching that in your books.';
    const items = res.invoices.map(
      (i) =>
        `${String(i.invoiceNumber ?? '(draft)')} — ${String(i.party ?? '—')}: ${inr(i.grandTotalPaise)}` +
        (isNum(i.amountDuePaise) && i.amountDuePaise > 0 ? `, ${inr(i.amountDuePaise)} still due` : ', paid') +
        ` [${String(i.status ?? '')}]`,
    );
    return `You have ${plural(res.count, 'invoice')}:\n\n${list(items)}`;
  }
  if (isNum(res.count) && isArr(res.bills)) {
    if (res.count === 0) return 'There are no purchase bills matching that in your books.';
    const items = res.bills.map(
      (b) =>
        `${String(b.vendorBillNumber ?? '—')} — ${String(b.supplier ?? '—')}: ${inr(b.grandTotalPaise)} [${String(b.status ?? '')}]`,
    );
    return `You have ${plural(res.count, 'bill')}:\n\n${list(items)}`;
  }
  if (isNum(res.count) && isArr(res.entries)) {
    if (res.count === 0) return 'No journal entries have been posted yet.';
    const items = res.entries.map((e) => {
      const debit = isArr(e.lines) ? e.lines.reduce((s, l) => s + (isNum(l.debitPaise) ? l.debitPaise : 0), 0) : 0;
      return `${String(e.entryNumber ?? '—')} ${dateStr(e.date)} — ${String(e.narration ?? '')}: ${inr(debit)} [${String(e.status ?? '')}]`;
    });
    return `The ${plural(res.entries.length, 'most recent entry', 'most recent entries')} in your general ledger:\n\n${list(items)}`;
  }
  if (isNum(res.count) && isArr(res.bankAccounts)) {
    if (res.count === 0) return 'No bank accounts are registered for this company yet.';
    const items = res.bankAccounts.map(
      (a) => `${String(a.name ?? '—')}${a.bankName ? ` (${String(a.bankName)})` : ''}${a.accountNumberMasked ? ` ••${String(a.accountNumberMasked).slice(-4)}` : ''} — source: ${String(a.source ?? '—')}`,
    );
    return `You have ${plural(res.count, 'bank account')}:\n\n${list(items)}`;
  }
  if (isNum(res.count) && isArr(res.transactions)) {
    if (res.count === 0) return 'No bank statement lines match that.';
    const items = res.transactions.map(
      (t) =>
        `${dateStr(t.txnDate)} — ${String(t.narration ?? '')}: ${inr(t.amountPaise)} ${String(t.direction ?? '')} [${String(t.status ?? '')}]`,
    );
    return `${plural(res.count, 'bank transaction')}:\n\n${list(items)}`;
  }
  if (isNum(res.count) && isArr(res.parties)) {
    if (res.count === 0) return 'No customers or suppliers have been added yet.';
    const items = res.parties.map(
      (p) => `${String(p.name ?? '—')} (${String(p.type ?? '')})${p.gstin ? ` — GSTIN ${String(p.gstin)}` : ''}`,
    );
    return `You have ${plural(res.count, 'party', 'parties')} on file:\n\n${list(items)}`;
  }
  if (isNum(res.count) && isArr(res.records)) {
    if (res.count === 0) {
      return `The GST IMS inbox is empty for ${String(res.period ?? 'that period')} — no supplier invoices have been reported against your GSTIN.`;
    }
    return `The IMS inbox has ${plural(res.count, 'supplier document')} for ${String(res.period ?? '')}. Each one is matched against your bills, and your accept/reject decision drives the input tax credit you can claim.`;
  }

  // ── GST return ────────────────────────────────────────────────────────────
  if (typeof res.type === 'string' && typeof res.period === 'string' && res.data) {
    const name = res.type === 'gstr1' ? 'GSTR-1 (outward supplies)' : 'GSTR-3B (summary)';
    return `Your ${name} for ${res.period} is generated and currently ${String(res.status ?? 'draft')}. It is built from your posted ledger entries, so every figure traces back to a journal entry.`;
  }

  // ── receivables (legacy shape) ────────────────────────────────────────────
  if (isArr(res.receivables)) {
    return res.receivables.length === 0
      ? 'You have no outstanding receivables.'
      : `You have ${plural(res.receivables.length, 'outstanding receivable')} pending collection.`;
  }

  return null;
}

/** The trial balance arrives as a bare array, so it needs its own entry point. */
export function narrateTrialBalance(rows: Dict[]): string {
  if (rows.length === 0) return 'The trial balance is empty — nothing has been posted to the ledger yet.';
  const debit = rows.reduce((s, r) => s + (isNum(r.balancePaise) && r.balancePaise > 0 ? r.balancePaise : 0), 0);
  const credit = rows.reduce((s, r) => s + (isNum(r.balancePaise) && r.balancePaise < 0 ? -r.balancePaise : 0), 0);
  const items = rows
    .filter((r) => isNum(r.balancePaise) && r.balancePaise !== 0)
    .map((r) => `${String(r.code ?? '')} ${String(r.name ?? '')}: ${inr(r.balancePaise)}`);
  const balanced =
    debit === credit
      ? 'Debits equal credits, so the ledger balances.'
      : 'Debits and credits do NOT match — that needs investigating.';
  return `Trial balance across ${plural(rows.length, 'account')}:\n\n${list(items, 12)}\n\nTotal debits ${inr(debit)}, total credits ${inr(credit)}. ${balanced}`;
}
