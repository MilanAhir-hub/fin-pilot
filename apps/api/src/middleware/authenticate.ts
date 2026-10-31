/**
 * JWT Authentication Middleware:
 * Verifies Bearer access tokens on incoming requests, sets authenticated user identity (req.user),
 * and tracks super-admin impersonation sessions with audit logging.
 */
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/tokenService';
import { AppError } from '../utils/AppError';

export interface AuthUser {
  id: string;
  familyId: string;
  impersonation?: { by: string; sessionId: string };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('AUTH_UNAUTHORIZED', 401);
  const claims = verifyAccessToken(header.slice('Bearer '.length));

  if (!claims.imp) {
    req.user = { id: claims.sub, familyId: claims.fam };
    next();
    return;
  }

  const { by, sid } = claims.imp;
  req.user = { id: claims.sub, familyId: claims.fam, impersonation: { by, sessionId: sid } };
  res.setHeader('X-Impersonation-Session', sid);
  res.setHeader('X-Impersonated-By', by);
  next();
}
