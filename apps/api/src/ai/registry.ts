/**
 * The tool registry (plan.md §24, Prompt 19). READ tools only — writes are
 * Phase 20 proposals. Each tool declares its permission; the list sent to
 * the model is FILTERED by the caller's permissions, and executeTool
 * OVERWRITES any model-supplied companyId with the server's (I8 + I9).
 */
import { z } from 'zod';
import { Types } from 'mongoose';
import { createInvoiceSchema, createJournalEntrySchema } from '@finpilot/shared';
import { forecastEngine } from '../engines/forecast';
import { GstEngine } from '../engines/gst/GstEngine';
import { BankAccount } from '../models/BankAccount';
import { BankTransaction } from '../models/BankTransaction';
import { Bill } from '../models/Bill';
import { Company } from '../models/Company';
import { Invoice } from '../models/Invoice';
import { Organization } from '../models/Organization';
import { imsService } from '../services/imsService';
import { journalService } from '../services/journalService';
import { partyService } from '../services/partyService';
import { reportService } from '../services/reportService';
import { requestContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

export interface AiTool {
  name: string;
  description: string;
  permission: string;
  schema: z.ZodTypeAny;
  execute(args: Record<string, unknown>, conversationId: Types.ObjectId): Promise<unknown>;
}

/** I10 — a write tool creates a PROPOSAL and touches nothing else. */
async function propose(
  type: 'invoice' | 'journal_entry' | 'ims_action',
  _payload: Record<string, unknown>,
  preview: Record<string, unknown>,
  _conversationId: Types.ObjectId,
): Promise<{ proposalId: string; type: string; expiresAt: Date; preview: unknown }> {
  return {
    proposalId: String(new Types.ObjectId()),
    type,
    expiresAt: new Date(Date.now() + 24 * 3600000),
    preview,
  };
}

const asOfArg = z.object({ asOf: z.string().optional() });
const asOf = (args: Record<string, unknown>) =>
  typeof args.asOf === 'string' ? new Date(args.asOf) : new Date();

/** The §32.1 MVP five. */
export const TOOLS: AiTool[] = [
  {
    name: 'getRevenue',
    description: 'Total income for the company as of a date',
    permission: 'report:read',
    schema: asOfArg,
    async execute(args) {
      const pnl = await reportService.profitLoss(asOf(args));
      return { totalIncomePaise: pnl.totalIncomePaise, income: pnl.income };
    },
  },
  {
    name: 'getExpenses',
    description: 'Total expenses for the company as of a date',
    permission: 'report:read',
    schema: asOfArg,
    async execute(args) {
      const pnl = await reportService.profitLoss(asOf(args));
      return { totalExpensesPaise: pnl.totalExpensesPaise, expenses: pnl.expenses };
    },
  },
  {
    name: 'getProfitAndLoss',
    description: 'Full P&L as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.profitLoss(asOf(args)),
  },
  {
    name: 'getOutstandingReceivables',
    description: 'Aged accounts receivable as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.agedReceivables(asOf(args)),
  },
  {
    name: 'getCashPosition',
    description: 'Cash and bank position as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.cashFlow(asOf(args)),
  },
  // Phase 21 narration layer — the Copilot narrates DETERMINISTIC numbers
  {
    name: 'getCashFlowForecast',
    description: '13-week P10/P50/P90 cash forecast (deterministic model)',
    permission: 'report:read',
    schema: z.object({}),
    execute: () => forecastEngine.cashFlow(),
  },
  {
    name: 'getHealthScore',
    description: 'Six-component business health score with drivers',
    permission: 'report:read',
    schema: z.object({}),
    execute: () => forecastEngine.healthScore(),
  },

  /*
   * ── The rest of the books ────────────────────────────────────────────────
   * The five MVP tools above answer only aggregate questions, so "show me my
   * invoices", "what is in my trial balance", "which bank lines are
   * unreconciled" had no tool to call and the Copilot either declined or
   * asked a clarifying question. Every tool below reads through the tenant
   * plugin, so each one is already scoped to the company in context (I8), and
   * each returns retrieved figures so I9 grounding still passes.
   */
  {
    name: 'getTrialBalance',
    description: 'Trial balance (every ledger account with its debit/credit balance) as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.trialBalance(asOf(args)),
  },
  {
    name: 'getBalanceSheet',
    description: 'Balance sheet (assets, liabilities, equity) as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.balanceSheet(asOf(args)),
  },
  {
    name: 'getAgedPayables',
    description: 'Aged accounts payable — what this company owes suppliers, by age bucket',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.agedPayables(asOf(args)),
  },
  {
    name: 'getCompanyProfile',
    description:
      'Profile of the company in context: legal/trade name, GSTIN, PAN, state, financial year, ' +
      'currency, and its parent organization with plan and limits. Use for any question about ' +
      '"my company", "my organization", "my GSTIN", "my plan".',
    permission: 'report:read',
    schema: z.object({}),
    async execute() {
      const ctx = requestContext.getStore();
      const company = await Company.findById(ctx!.companyId).lean();
      if (!company) throw new AppError('SYS_NOT_FOUND', 404);
      const org = await Organization.findById(company.organizationId)
        .select('name type plan limits')
        .lean();
      return {
        company: {
          legalName: company.legalName,
          tradeName: company.tradeName ?? null,
          gstin: company.gstin ?? null,
          pan: company.pan ?? null,
          gstRegistrationType: company.gstRegistrationType,
          stateCode: company.stateCode,
          currency: company.currency,
          financialYearStartMonth: company.financialYearStartMonth,
        },
        organization: org
          ? { name: org.name, type: org.type, plan: org.plan, limits: org.limits }
          : null,
      };
    },
  },
  {
    name: 'listInvoices',
    description:
      'Sales invoices for this company, newest first. Optionally filter by status ' +
      '(draft, issued, partially_paid, paid, overdue, cancelled).',
    permission: 'report:read',
    schema: z.object({
      status: z
        .enum(['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'])
        .optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async execute(args) {
      const q: Record<string, unknown> = {};
      if (args.status) q.status = args.status;
      const rows = await Invoice.find(q)
        .sort({ issueDate: -1 })
        .limit((args.limit as number) ?? 20)
        .select('invoiceNumber partySnapshot issueDate dueDate grandTotalPaise amountDuePaise status')
        .lean();
      return {
        count: rows.length,
        invoices: rows.map((r) => ({
          invoiceNumber: r.invoiceNumber ?? '(draft)',
          party: r.partySnapshot?.name ?? null,
          issueDate: r.issueDate,
          dueDate: r.dueDate,
          grandTotalPaise: r.grandTotalPaise,
          amountDuePaise: r.amountDuePaise,
          status: r.status,
        })),
      };
    },
  },
  {
    name: 'listBills',
    description: 'Purchase bills (supplier invoices) for this company, newest first.',
    permission: 'report:read',
    schema: z.object({
      status: z.enum(['draft', 'approved', 'cancelled']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async execute(args) {
      const q: Record<string, unknown> = {};
      if (args.status) q.status = args.status;
      const rows = await Bill.find(q)
        .sort({ billDate: -1 })
        .limit((args.limit as number) ?? 20)
        .select('vendorBillNumber partySnapshot billDate dueDate grandTotalPaise amountPaidPaise status')
        .lean();
      return {
        count: rows.length,
        bills: rows.map((r) => ({
          vendorBillNumber: r.vendorBillNumber,
          supplier: r.partySnapshot?.name ?? null,
          billDate: r.billDate,
          dueDate: r.dueDate,
          grandTotalPaise: r.grandTotalPaise,
          amountPaidPaise: r.amountPaidPaise,
          status: r.status,
        })),
      };
    },
  },
  {
    name: 'listJournalEntries',
    description:
      'Recent posted journal entries (the general ledger) with their balanced debit/credit lines.',
    permission: 'report:read',
    schema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    async execute(args) {
      const page = await journalService.list(undefined, (args.limit as number) ?? 20);
      return {
        count: page.entries.length,
        entries: page.entries.map((e) => ({
          entryNumber: e.entryNumber,
          date: e.date,
          narration: e.narration,
          status: e.status,
          lines: e.lines.map((l) => ({
            accountId: String(l.accountId),
            debitPaise: l.debitPaise,
            creditPaise: l.creditPaise,
          })),
        })),
      };
    },
  },
  {
    name: 'listBankAccounts',
    description: 'Bank accounts registered for this company, with their reconciliation source.',
    permission: 'report:read',
    schema: z.object({}),
    async execute() {
      const rows = await BankAccount.find({})
        .select('name bankName accountNumberMasked ifsc source aaConsentStatus')
        .lean();
      return { count: rows.length, bankAccounts: rows };
    },
  },
  {
    name: 'listBankTransactions',
    description:
      'Bank statement lines for this company, newest first. Filter by status to find what is ' +
      'still unreconciled.',
    permission: 'report:read',
    schema: z.object({
      status: z.enum(['unreconciled', 'reconciled', 'excluded']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async execute(args) {
      const q: Record<string, unknown> = {};
      if (args.status) q.status = args.status;
      const rows = await BankTransaction.find(q)
        .sort({ txnDate: -1 })
        .limit((args.limit as number) ?? 20)
        .select('txnDate narration amountPaise direction status reference')
        .lean();
      return { count: rows.length, transactions: rows };
    },
  },
  {
    name: 'listParties',
    description: 'Customers and suppliers (parties) of this company, with GSTIN and state.',
    permission: 'report:read',
    schema: z.object({ type: z.enum(['customer', 'vendor']).optional() }),
    async execute(args) {
      const rows = await partyService.list({ type: args.type as 'customer' | 'vendor' | undefined });
      return {
        count: rows.length,
        parties: rows.map((p) => ({
          name: p.name,
          type: p.type,
          gstin: p.gstin ?? null,
          state: p.billingAddress?.state ?? null,
        })),
      };
    },
  },
  {
    name: 'getGstReturn',
    description:
      'Generate or fetch a GST return for a tax period. type is gstr1 (outward supplies) or ' +
      'gstr3b (summary). period is YYYY-MM.',
    permission: 'report:read',
    schema: z.object({
      type: z.enum(['gstr1', 'gstr3b']),
      period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM'),
    }),
    async execute(args) {
      const ctx = requestContext.getStore();
      if (!ctx?.companyId) throw new AppError('TENANT_CONTEXT_MISSING', 500);
      const doc =
        args.type === 'gstr1'
          ? await GstEngine.generateGstr1(ctx.companyId, args.period as string)
          : await GstEngine.generateGstr3b(ctx.companyId, args.period as string);
      return { type: doc.type, period: doc.period, status: doc.status, data: doc.data };
    },
  },
  {
    name: 'listImsRecords',
    description:
      'GST IMS inbox: supplier invoices reported to GSTN for a period, with match status and ' +
      'the accept/reject/pending action taken. period is YYYY-MM.',
    permission: 'ims:action',
    schema: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM') }),
    async execute(args) {
      const records = await imsService.list(args.period as string);
      return { count: records.length, period: args.period, records };
    },
  },
];

/** Write tools (ai:write): propose, never execute (I10). */
export const WRITE_TOOLS: AiTool[] = [
  {
    name: 'proposeInvoice',
    description: 'Draft a sales invoice PROPOSAL for human confirmation',
    permission: 'ai:write',
    schema: createInvoiceSchema,
    execute: (args, conversationId) =>
      propose('invoice', args, { summary: 'invoice draft', lines: args.lines }, conversationId),
  },
  {
    name: 'proposeJournalEntry',
    description: 'Draft a manual journal entry PROPOSAL for human confirmation',
    permission: 'ai:write',
    schema: createJournalEntrySchema,
    execute: (args, conversationId) =>
      propose(
        'journal_entry',
        args,
        { summary: 'journal entry draft', lines: args.lines },
        conversationId,
      ),
  },
  {
    name: 'proposeImsAction',
    description: 'Propose an IMS accept/reject/pending action for human confirmation',
    permission: 'ai:write',
    schema: z.object({
      recordId: z.string().length(24),
      action: z.enum(['accept', 'reject', 'pending']),
      remarks: z.string().max(500).optional(),
    }),
    execute: (args, conversationId) =>
      propose('ims_action', args, { summary: `IMS ${args.action}` }, conversationId),
  },
];

export function toolsFor(permissions: string[]): AiTool[] {
  return [...TOOLS, ...WRITE_TOOLS].filter((t) => permissions.includes(t.permission));
}

/** Injects the SERVER's companyId, overwriting anything the model supplied. */
export async function executeTool(
  tool: AiTool,
  modelArgs: Record<string, unknown>,
  conversationId: Types.ObjectId,
): Promise<unknown> {
  const ctx = requestContext.getStore();
  if (!ctx?.companyId) throw new AppError('TENANT_CONTEXT_MISSING', 500);
  const args = { ...tool.schema.parse(modelArgs), companyId: String(ctx.companyId) };
  // ↑ even if the model sent companyId, the parse strips unknown keys and the
  // server's is written — a prompt-injected foreign tenant CANNOT leak (I8)
  const result = await tool.execute(args, conversationId);
  return result;
}
