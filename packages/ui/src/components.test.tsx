import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AnimatedBrandMark,
  Badge,
  BrandLockup,
  BrandMark,
  BrandedLoading,
  Button,
  Card,
  IconButton,
} from './index';

describe('shared UI primitives', () => {
  it('renders button variants and disabled semantics', () => {
    render(
      <>
        <Button variant="primary">Primary action</Button>
        <Button disabled variant="destructive">
          Delete analysis
        </Button>
        <Button loading>Running analysis</Button>
      </>
    );

    expect(screen.getByRole('button', { name: 'Primary action' }).className).toContain(
      'bg-primary'
    );
    expect(
      (screen.getByRole('button', { name: 'Delete analysis' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Running analysis' }).getAttribute('aria-busy')).toBe(
      'true'
    );
  });

  it.each([
    [
      'primary',
      'bg-primary',
      'hover:bg-primary-hover',
      'active:brightness-95',
      'disabled:bg-disabled',
    ],
    [
      'secondary',
      'bg-secondary',
      'hover:bg-accent',
      'active:brightness-95',
      'disabled:bg-disabled',
    ],
    [
      'outline',
      'border-border-strong',
      'hover:bg-muted',
      'active:bg-accent',
      'disabled:bg-disabled',
    ],
    [
      'inverse',
      'bg-inverse-surface',
      'hover:bg-inverse-surface-hover',
      'active:bg-inverse-surface-active',
      'disabled:bg-inverse-disabled',
    ],
    ['ghost', 'bg-transparent', 'hover:bg-muted', 'active:bg-accent', 'disabled:bg-disabled'],
    [
      'destructive',
      'bg-destructive',
      'hover:brightness-95',
      'active:brightness-90',
      'disabled:bg-disabled',
    ],
  ] as const)(
    'renders the %s button variant',
    (variant, baseClass, hoverClass, activeClass, disabledClass) => {
      render(<Button variant={variant}>{variant}</Button>);

      const classes = screen.getByRole('button', { name: variant }).className;
      expect(classes).toContain(baseClass);
      expect(classes).toContain(hoverClass);
      expect(classes).toContain(activeClass);
      expect(classes).toContain('focus-visible:ring-2');
      expect(classes).toContain(disabledClass);
    }
  );

  it('passes button styling and disabled behavior to an asChild link', () => {
    const onClick = vi.fn();

    render(
      <Button asChild disabled onClick={onClick}>
        <a href="/analyses/new">Start analysis</a>
      </Button>
    );

    const link = screen.getByRole('link', { name: 'Start analysis' });
    fireEvent.click(link);

    expect(link.getAttribute('href')).toBe('/analyses/new');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders status badges, cards, and labelled icon controls', () => {
    render(
      <>
        <Badge variant="success">Validated</Badge>
        <Card aria-label="Analysis summary">Summary</Card>
        <IconButton label="Open map inspector">Map</IconButton>
      </>
    );

    expect(screen.getByText('Validated').className).toContain('bg-success-surface');
    expect(screen.getByRole('region', { name: 'Analysis summary' }).className).toContain(
      'shadow-card'
    );
    expect(screen.getByRole('button', { name: 'Open map inspector' })).toBeDefined();
  });

  it('renders accessible static and animated brand marks from the shared geometry', () => {
    const { container } = render(
      <>
        <BrandMark data-testid="decorative-mark" />
        <BrandMark title="EcoSuitability contour mark" />
        <AnimatedBrandMark title="Loading EcoSuitability" />
      </>
    );

    expect(screen.getByTestId('decorative-mark').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('img', { name: 'EcoSuitability contour mark' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Loading EcoSuitability' })).toBeDefined();
    expect(container.querySelectorAll('svg path')).toHaveLength(9);
  });

  it('renders lockup tones and a branded live loading state', () => {
    render(
      <>
        <BrandLockup descriptor="Suitability analysis" />
        <BrandLockup descriptor="Inverse treatment" tone="inverse" />
        <BrandedLoading description="Retrieving result metadata." label="Loading analysis…" />
      </>
    );

    expect(screen.getByText('Suitability analysis').className).toContain('text-muted-foreground');
    expect(screen.getByText('Inverse treatment').className).toContain('text-inverse-muted');
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Loading analysis…')).toBeDefined();
  });
});
