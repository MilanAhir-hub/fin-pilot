/**
 * AI Usage & Token Budgeting:
 * Enforces monthly AI token usage limits per organization subscription plan.
 * Verifies available token quota before making calls to prevent excess consumption.
 */
import { upgradePathFor } from '@finpilot/shared';
import { AiUsage } from '../models/AiConversation';
import { aiTokensConsumed } from '../observability/metrics';
import { Company } from '../models/Company';
import { Organization } from '../models/Organization';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

const month = () => new Date().toISOString().slice(0, 7);

export async function assertBudget(): Promise<void> {
  const ctx = requireCompanyContext();
  const company = await Company.findById(ctx.companyId).lean();
  const org = company ? await Organization.findById(company.organizationId).lean() : null;
  const limit = org?.limits.aiTokensMonth ?? 200_000;
  const usage = await AiUsage.findOne({ month: month() }).lean();
  if ((usage?.tokensUsed ?? 0) >= limit) {
    throw new AppError('AI_QUOTA_EXCEEDED', 402, {
      limit,
      used: usage?.tokensUsed ?? 0,
      upgrade: upgradePathFor(org?.plan ?? 'free'), // §32 Phase 23 contract
    });
  }
}

export async function recordUsage(tokens: number): Promise<void> {
  const ctx = requireCompanyContext();
  aiTokensConsumed.inc(tokens);
  await AiUsage.findOneAndUpdate(
    { month: month() },
    { $inc: { tokensUsed: tokens }, $setOnInsert: { companyId: ctx.companyId } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}
