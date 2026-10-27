import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SetupShell } from './SetupShell';

afterEach(cleanup);

describe('SetupShell', () => {
  it('keeps future setup steps non-interactive', () => {
    render(
      <SetupShell
        analysisId="an_0123456789abcdef0123456789abcdef"
        current="data"
        title="Add analysis data"
        description="Upload files."
      >
        Content
      </SetupShell>
    );

    expect(screen.getAllByRole('link', { name: /Data/ })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Validation/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Configuration/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Review/ })).toBeNull();
    expect(screen.getAllByText('Validation')[0]?.getAttribute('aria-disabled')).toBe('true');
  });

  it('allows navigation back to reached steps', () => {
    render(
      <SetupShell
        analysisId="an_0123456789abcdef0123456789abcdef"
        current="configuration"
        title="Configure analysis"
        description="Configure the model."
      >
        Content
      </SetupShell>
    );

    expect(screen.getAllByRole('link', { name: /Data/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Validation/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Configuration/ })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Review/ })).toBeNull();
  });
});
