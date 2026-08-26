import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appearanceStorageKey,
  applyAppearance,
  getStoredAppearance,
  resolveTheme,
} from './appearance';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = '';
  document.documentElement.dataset.appearance = '';
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe('appearance', () => {
  it('resolves light, dark, and system appearance', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('persists an explicit preference and updates root data attributes', () => {
    applyAppearance('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(appearanceStorageKey)).toBe('dark');
    expect(getStoredAppearance()).toBe('dark');
  });
});
