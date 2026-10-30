/**
 * DLQ service.
 */
import { AppError } from '../utils/AppError';

export const dlqService = {
  list(_queue?: string): Promise<never[]> {
    return Promise.resolve([]);
  },

  async replay(_id: string, _fixedData?: unknown): Promise<{ jobId: string }> {
    throw new AppError('SYS_NOT_FOUND', 404);
  },
};
