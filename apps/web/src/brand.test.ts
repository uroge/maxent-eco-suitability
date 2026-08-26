import { describe, expect, it } from 'vitest';
import { resolveClientBrand } from './brand';

describe('brand resolution', () => {
  it('accepts a deployment-provided brand slug', () => {
    expect(resolveClientBrand('client-42')).toBe('client-42');
  });

  it('omits absent or invalid brand values', () => {
    expect(resolveClientBrand(undefined)).toBeUndefined();
    expect(resolveClientBrand('Invalid brand')).toBeUndefined();
  });
});
