import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('landing page', () => {
  it('renders the product landing content and truthful analysis CTA', () => {
    const { container } = render(<Home />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /From species observations.*to habitat suitability maps/,
      })
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Start analysis' }).getAttribute('href')).toBe(
      '/analyses/new'
    );
    expect(screen.getByText('How it works')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Accepted formats' })).toBeDefined();
    expect(screen.getByRole('contentinfo')).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Utility navigation' })).toBeDefined();
    expect(
      screen.getByRole('img', {
        name: /scientific atlas illustration showing habitat suitability/i,
      })
    ).toBeDefined();
    expect(
      container.querySelector('[data-atlas-composition="desktop"]')?.getAttribute('viewBox')
    ).toBe('0 0 960 560');
    expect(
      container.querySelector('[data-atlas-composition="mobile"]')?.getAttribute('viewBox')
    ).toBe('0 0 420 360');
    expect(container.querySelectorAll('[data-atlas-element="occurrence-focus"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-atlas-element="legend"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-atlas-element="scale"]')).toHaveLength(2);
  });
});
