import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { analysisArtifactSpecifications } from '@ecosuitability/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadsScreen } from './DownloadsScreen';

const analysisId = 'an_0123456789abcdef0123456789abcdef';
const json = vi.fn();

const result = {
  result: {
    analysisId,
    completedAt: '2099-09-02T12:00:00.000Z',
    resultExpiresAt: '2099-09-04T12:00:00.000Z',
    reproducibility: {
      inputRevision: 2,
      configurationRevision: 1,
      inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
      configurationFingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
      seed: 42,
    },
    artifacts: analysisArtifactSpecifications.map((definition, index) => ({
      id: `ar_${String(index).padStart(32, '0')}`,
      ...definition,
      size: index + 1,
      sha256: 'a'.repeat(64),
      sha256Verification: 'worker-verified' as const,
      createdAt: '2099-09-02T12:00:00.000Z',
    })),
  },
};

vi.mock('../analysis/api', () => ({
  analysisKeys: { results: (id: string) => ['results', id] },
  useAnalysisApi: () => ({ json }),
}));

afterEach(() => cleanup());

const renderScreen = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DownloadsScreen analysisId={analysisId} />
    </QueryClientProvider>
  );

describe('DownloadsScreen', () => {
  beforeEach(() => {
    json.mockReset();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('shows frozen reproducibility data and requests a fresh bundle URL', async () => {
    json.mockResolvedValueOnce(result).mockResolvedValueOnce({
      downloadUrl: 'https://download.example/bundle',
      expiresAt: '2099-09-02T12:05:00.000Z',
    });
    renderScreen();

    expect(await screen.findByText('Reproducibility')).not.toBeNull();
    expect(screen.getByText(result.result.reproducibility.inputFingerprint)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download all' }));

    const bundle = result.result.artifacts.find((artifact) => artifact.kind === 'result-bundle')!;
    await waitFor(() =>
      expect(json).toHaveBeenCalledWith(
        `/v1/analyses/${analysisId}/results/${bundle.id}/download`,
        expect.anything(),
        { method: 'POST' }
      )
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it('keeps the page available when signed-link creation fails', async () => {
    json.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('unavailable'));
    renderScreen();

    const buttons = await screen.findAllByRole('button', { name: 'Download' });
    fireEvent.click(buttons[0]!);

    expect(await screen.findByText(/signed download link could not be created/i)).not.toBeNull();
    expect(screen.getByText('Reproducibility')).not.toBeNull();
  });

  it('disables signed-link requests for an expired result', async () => {
    json.mockResolvedValueOnce({
      result: { ...result.result, resultExpiresAt: '2020-09-04T12:00:00.000Z' },
    });
    renderScreen();

    expect(await screen.findByText(/artifacts have expired/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Download all' }).hasAttribute('disabled')).toBe(
      true
    );
    expect(json).toHaveBeenCalledOnce();
  });
});
