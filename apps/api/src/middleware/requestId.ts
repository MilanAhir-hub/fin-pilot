/**
 * Unique Request ID Middleware:
 * Assigns a UUID v7 identifier to every incoming request, returning it in the
 * X-Request-Id header to trace requests across logs, metrics, and error reports.
 */
import type { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = uuidv7();
  res.setHeader('X-Request-Id', req.id);
  next();
}
