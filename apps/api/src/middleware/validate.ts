/**
 * Schema Validation Middleware:
 * Validates request body, query parameters, and route params using Zod schemas,
 * rejecting invalid payloads with structured 422 validation errors.
 */
import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

declare module 'express-serve-static-core' {
  interface Request {
    validatedParams?: unknown;
    validatedQuery?: unknown;
  }
}

export function validate(schemas: Schemas | ZodTypeAny) {
  const spec: Schemas = 'safeParse' in schemas ? { body: schemas as ZodTypeAny } : schemas;

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (spec.body) req.body = spec.body.parse(req.body);
    // Express 5 exposes req.params/req.query via getters — store parsed copies.
    if (spec.params) req.validatedParams = spec.params.parse(req.params);
    if (spec.query) req.validatedQuery = spec.query.parse(req.query);
    next();
  };
}
