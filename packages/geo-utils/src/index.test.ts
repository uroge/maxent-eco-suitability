import { describe, expect, it } from 'vitest';
import { geodesicDistanceMetres } from './index';

describe('geodesicDistanceMetres', () => {
  it('calculates bounded great-circle distances', () => {
    expect(geodesicDistanceMetres([0, 0], [0.01, 0])).toBeCloseTo(1111.95, 1);
    expect(geodesicDistanceMetres([10, 20], [10, 20])).toBe(0);
  });
});
