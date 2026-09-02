import { describe, expect, it } from 'vitest';
import runtimeUtils from './index.cjs';

const { constantTimeBearerTokenEquals, resolveRequestId, withTimeout } = runtimeUtils;

describe('runtime utils', () => {
  it('accepts only bounded request identifiers', () => {
    expect(resolveRequestId('request-123')).toBe('request-123');
    expect(resolveRequestId('invalid value')).toMatch(/^[a-f0-9-]{36}$/i);
  });

  it('compares bearer tokens without accepting malformed values', () => {
    expect(constantTimeBearerTokenEquals('Bearer expected', 'expected')).toBe(true);
    expect(constantTimeBearerTokenEquals('Basic expected', 'expected')).toBe(false);
  });

  it('rejects an operation that exceeds its bounded timeout', async () => {
    await expect(
      withTimeout(new Promise((resolve) => setTimeout(resolve, 25)), 1, 'Timed out.')
    ).rejects.toThrow('Timed out.');
  });
});
