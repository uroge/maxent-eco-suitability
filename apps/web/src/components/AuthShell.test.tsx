import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthShell } from './AuthShell';

describe('AuthShell', () => {
  it('provides a branded editorial shell without duplicating the authentication heading', () => {
    render(
      <AuthShell>
        <form aria-label="Authentication form">Clerk form</form>
      </AuthShell>
    );

    expect(screen.getByRole('main')).toBeDefined();
    expect(
      screen.getByRole('heading', { name: 'Scientific modelling, made spatial.' })
    ).toBeDefined();
    expect(screen.getByRole('form', { name: 'Authentication form' })).toBeDefined();
    expect(screen.getAllByRole('link', { name: /EcoSuitability home/i })).toHaveLength(2);
  });
});
