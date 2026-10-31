/**
 * AI & Copilot API Routes:
 * Exposes REST and SSE endpoints for managing AI chat conversations,
 * streaming Copilot responses, and fetching token usage stats.
 */
import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { runCopilotTurn } from '../../ai/gateway';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { requireModule } from '../../middleware/requireModule';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { AiConversation, AiUsage } from '../../models/AiConversation';
import { requestContext, requireCompanyContext } from '../../plugins/tenantScope';
import { permissionCache } from '../../services/permissionCache';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const aiRoutes = Router();
aiRoutes.use(authenticate, tenantResolve('header'), authorize('ai:read'), requireModule('ai'));

aiRoutes.post(
  '/conversations',
  asyncHandler(async (_req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const conversation = await AiConversation.create({ userId: ctx.userId, messages: [] });
    ok(res, { id: String(conversation._id) }, 201);
  }),
);

/**
 * Conversations were being written to the database and then stranded: the UI
 * held the id in component state only, so a page reload orphaned the thread
 * and there was no way to list or reopen one. These two reads are what make a
 * saved chat a saved chat. Both are scoped to the caller's own conversations —
 * the tenant plugin pins companyId, userId pins the person.
 */
aiRoutes.get(
  '/conversations',
  asyncHandler(async (_req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const rows = await AiConversation.find({ userId: ctx.userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    ok(res, {
      conversations: rows.map((c) => ({
        id: String(c._id),
        title: c.title,
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      })),
    });
  }),
);

aiRoutes.get(
  '/conversations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const conversation = await AiConversation.findOne({
      _id: String(req.params.id),
      userId: ctx.userId,
    }).lean();
    if (!conversation) throw new AppError('SYS_NOT_FOUND', 404);
    ok(res, {
      id: String(conversation._id),
      title: conversation.title,
      // tool rows are the audit trail, not conversation — the UI shows the
      // tool chips from the live stream instead.
      messages: conversation.messages
        .filter((m) => m.role !== 'tool')
        .map((m) => ({ role: m.role, content: m.content, at: m.at })),
    });
  }),
);

aiRoutes.post(
  '/conversations/:id/messages',
  validate(z.object({ message: z.string().trim().min(1).max(4_000) })),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const permissions = await permissionCache.get(String(ctx.userId), String(ctx.companyId));

    // SSE stream: tool-call chips, chunks, content, done
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const emit = (event: { type: string; data: unknown }) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      (res as unknown as { flush?: () => void }).flush?.();
    };
    try {
      await runCopilotTurn(
        new Types.ObjectId(String(req.params.id)),
        req.body.message,
        permissions,
        emit,
      );
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      const code = (err as { code?: string }).code ?? 'SYS_INTERNAL_ERROR';
      res.statusCode = status; // headers may already be out — best effort
      emit({ type: 'error', data: { code, status } });
    }
    res.end();
  }),
);

/** The proposal inbox the UI renders. */
aiRoutes.get(
  '/proposals',
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, { proposals: [] });
  }),
);

aiRoutes.post(
  '/proposals/:id/confirm',
  authorize('ai:write'),
  idempotency,
  asyncHandler(async (_req: Request, _res: Response) => {
    throw new AppError('SYS_NOT_FOUND', 404);
  }),
);

aiRoutes.post(
  '/proposals/:id/reject',
  authorize('ai:write'),
  asyncHandler(async (_req: Request, _res: Response) => {
    throw new AppError('SYS_NOT_FOUND', 404);
  }),
);

aiRoutes.get(
  '/usage',
  asyncHandler(async (_req: Request, res: Response) => {
    requestContext.getStore();
    const usage = await AiUsage.findOne({ month: new Date().toISOString().slice(0, 7) }).lean();
    ok(res, { month: usage?.month ?? null, tokensUsed: usage?.tokensUsed ?? 0 });
  }),
);
