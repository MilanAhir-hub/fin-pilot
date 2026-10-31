/**
 * Multi-Tenant Scope Resolver Middleware:
 * Extracts company context from headers (X-Company-Id) or route parameters,
 * verifies user membership, and sets the tenant boundary for all subsequent queries.
 */
import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { membershipRepo } from '../repositories/membershipRepo';
import { requestContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

export function tenantResolve(source: 'header' | 'param' = 'header') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const raw =
      source === 'param' ? req.params.id : (req.headers['x-company-id'] as string | undefined);

    if (!raw || !Types.ObjectId.isValid(String(raw))) {
      throw new AppError('TENANT_COMPANY_CONTEXT_REQUIRED', 400);
    }
    const companyId = new Types.ObjectId(String(raw));
    const userId = new Types.ObjectId(req.user!.id);

    membershipRepo
      .findActive(userId, companyId)
      .then((membership) => {
        if (!membership) return next(new AppError('TENANT_NOT_A_MEMBER', 403));
        // Everything downstream — authorize, controllers, repositories,
        // the tenantScope plugin — sees this context via AsyncLocalStorage.
        const impersonatedBy = req.user!.impersonation
          ? new Types.ObjectId(req.user!.impersonation.by)
          : undefined;
        requestContext.run({ userId, companyId, roleId: membership.roleId, impersonatedBy }, () =>
          next(),
        );
      })
      .catch(next);
  };
}
