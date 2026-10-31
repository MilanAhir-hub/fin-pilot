/**
 * Feature Module Gate Middleware:
 * Verifies that the targeted business section (e.g., GST, banking, payroll, inventory)
 * is enabled for the active company before processing the request.
 */
import type { NextFunction, Request, Response } from 'express';
import { Company } from '../models/Company';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

/**
 * Company documents change rarely and this runs on every request in the
 * section, so the answer is cached briefly. Short enough that switching a
 * section off takes effect while the operator is still looking at the screen.
 */
const TTL_MS = 10_000;
const cache = new Map<string, { at: number; disabled: string[] }>();

/** Drops a company's cached answer so a toggle applies immediately. */
export function invalidateModuleCache(companyId: string): void {
  cache.delete(companyId);
}

async function disabledFor(companyId: string): Promise<string[]> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.disabled;
  const company = await Company.findById(companyId).select('disabledModules').lean();
  const disabled = company?.disabledModules ?? [];
  cache.set(companyId, { at: Date.now(), disabled });
  return disabled;
}

export function requireModule(moduleKey: string) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    const ctx = requireCompanyContext();
    disabledFor(String(ctx.companyId))
      .then((disabled) => {
        if (disabled.includes(moduleKey)) {
          return next(new AppError('SYS_MODULE_DISABLED', 403, { module: moduleKey }));
        }
        next();
      })
      .catch(next);
  };
}
