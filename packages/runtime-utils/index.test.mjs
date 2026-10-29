import { EventEmitter } from 'node:events';
import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import runtimeUtils from './index.cjs';

const {
  canonicalizeJson,
  completeOnResponseEnd,
  constantTimeBearerTokenEquals,
  presignS3Put,
  resolveRequestId,
  withTimeout,
} = runtimeUtils;

describe('runtime utils', () => {
  it('canonicalizes JSON object keys and numeric negative zero', () => {
    expect(canonicalizeJson({ z: -0, a: ['value', { b: true }] })).toBe(
      '{"a":["value",{"b":true}],"z":0}'
    );
    expect(() => canonicalizeJson({ value: Number.NaN })).toThrow('non-finite');
  });

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

  it('completes a response lifecycle only once', () => {
    const response = new EventEmitter();
    let completions = 0;

    completeOnResponseEnd(response, () => {
      completions += 1;
    });
    response.emit('finish');
    response.emit('close');

    expect(completions).toBe(1);
  });

  it('keeps upload metadata in signed headers without optional checksum parameters', async () => {
    const client = new S3Client({
      region: 'us-east-1',
      endpoint: 'http://storage.internal:8333',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    try {
      const signed = new URL(
        await presignS3Put(
          client,
          'test-bucket',
          'results/artifact.bin',
          300,
          'application/octet-stream',
          'attachment; filename="artifact.bin"',
          'a'.repeat(64)
        )
      );
      const signedHeaders = signed.searchParams
        .get('X-Amz-SignedHeaders')
        ?.split(';');

      expect(signedHeaders).toContain('content-disposition');
      expect(signedHeaders).toContain('x-amz-meta-sha256');
      expect(signed.searchParams.has('x-amz-meta-sha256')).toBe(false);
      expect(
        [...signed.searchParams.keys()].some((key) => key.includes('checksum'))
      ).toBe(false);
    } finally {
      client.destroy();
    }
  });
});
