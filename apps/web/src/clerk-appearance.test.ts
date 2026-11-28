import { describe, expect, it } from 'vitest';
import { clerkAppearance } from './clerk-appearance';

describe('Clerk appearance', () => {
  it('maps authentication surfaces and actions to semantic design tokens', () => {
    expect(clerkAppearance.variables.colorBackground).toBe('var(--surface)');
    expect(clerkAppearance.variables.colorPrimary).toBe('var(--primary)');
    expect(clerkAppearance.variables.colorDanger).toBe('var(--destructive)');
    expect(clerkAppearance.variables.borderRadius).toBe('var(--radius-control)');
    expect(clerkAppearance.elements.formButtonPrimary.background).toBe('var(--primary)');
    expect(clerkAppearance.elements.socialButtonsBlockButton.border).toBe(
      '1px solid var(--border-strong)'
    );
    expect(clerkAppearance.options.elevation).toBe('flush');
  });
});
