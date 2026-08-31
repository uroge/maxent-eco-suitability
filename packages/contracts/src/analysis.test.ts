import { describe, expect, it } from 'vitest';
import {
  analysisIdSchema,
  analysisStatusSchema,
  createAnalysisRequestSchema,
  idempotencyKeySchema,
} from './analysis';

describe('analysis contracts', () => {
  it('accepts every lifecycle state and rejects legacy completed status', () => {
    for (const status of [
      'draft',
      'uploading',
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'expired',
    ]) {
      expect(analysisStatusSchema.safeParse(status).success).toBe(true);
    }

    expect(analysisStatusSchema.safeParse('completed').success).toBe(false);
  });

  it('accepts only opaque analysis IDs and bounded idempotency keys', () => {
    expect(analysisIdSchema.safeParse('an_0123456789abcdef0123456789abcdef').success).toBe(true);
    expect(analysisIdSchema.safeParse('analysis-123').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('request-key-123').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('short').success).toBe(false);
  });

  it('strips no unknown create fields', () => {
    expect(
      createAnalysisRequestSchema.safeParse({
        displayName: 'Wildcat',
        ownerId: 'user_client_must_not_supply',
      }).success
    ).toBe(false);
  });
});
