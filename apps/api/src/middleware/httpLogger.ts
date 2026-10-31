/**
 * HTTP Request Logging Middleware:
 * Automatically logs structured incoming requests and outgoing response statuses,
 * attaching unique request IDs while redacting sensitive tokens and passwords.
 */
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id: string }).id,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => req.url === '/healthz' || req.url === '/metrics',
  },
});
