import { fireEvent, render, screen } from '@testing-library/react';
import { Badge, Button, Card, IconButton } from '@ecosuitability/ui';
import { describe, expect, it, vi } from 'vitest';

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
});
