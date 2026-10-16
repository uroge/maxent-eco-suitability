import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('landing page', () => {
  it('renders the product landing content and truthful analysis CTA', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'From species observations to habitat suitability maps',
      })
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Start analysis' }).getAttribute('href')).toBe(
      '/analyses/new'
    );
    expect(screen.getByText('How it works')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Accepted formats' })).toBeDefined();
    expect(screen.getByRole('contentinfo')).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Utility navigation' })).toBeDefined();
  });
});
