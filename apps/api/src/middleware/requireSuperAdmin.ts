/**
 * Super Admin Gate Middleware:
 * Restricts access to platform-level administrative operations and tenant management
 * exclusively to verified super-admin operators.
 */
import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.impersonation) {
    throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'not available while impersonating' });
  }
  User.findById(req.user!.id)
    .select('+superAdmin')
    .lean()
    .then((user) => {
      if (!user?.superAdmin) return next(new AppError('AUTH_FORBIDDEN', 403));
      next();
    })
    .catch(next);
}
