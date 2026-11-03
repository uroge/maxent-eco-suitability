import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultMapPreview } from './ResultMapPreview';

const addControl = vi.fn();
const addLayer = vi.fn();
const mapOptions: Array<{
  fitBoundsOptions?: { padding?: number };
  interactive?: boolean;
  transformRequest?: (url: string) => { headers?: Record<string, string>; url: string };
}> = [];

vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  }
);

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue('rotating-token') }),
}));

vi.mock('../analysis/api', () => ({
  analysisKeys: { map: (id: string) => ['analysis', id, 'map'] },
  useAnalysisApi: () => ({
    json: vi.fn().mockResolvedValue({
      capabilities: {
        analysisId: 'an_0123456789abcdef0123456789abcdef',
        basemaps: [],
        bounds: [-10, -10, 10, 10],
        layers: [
          {
            dataType: 'raster',
            id: 'ml_11111111111111111111111111111111',
            kind: 'suitability',
            label: 'Suitability',
            legend: [],
          },
          {
            dataType: 'vector',
            id: 'ml_22222222222222222222222222222222',
            kind: 'occurrences',
            label: 'Occurrences',
            legend: [],
          },
        ],
        terrain: { available: false, layerId: null, unavailableReason: 'No terrain.' },
      },
    }),
  }),
}));

vi.mock('maplibre-gl', () => ({
  NavigationControl: class NavigationControl {},
  Map: class Map {
    public constructor(options: (typeof mapOptions)[number]) {
      mapOptions.push(options);
    }
    public addControl = addControl;
    public addLayer = addLayer;
    public addSource = vi.fn();
    public fitBounds = vi.fn();
    public getLayer = vi.fn().mockReturnValue(undefined);
    public getSource = vi.fn().mockReturnValue(undefined);
    public isStyleLoaded = vi.fn().mockReturnValue(false);
    public off = vi.fn();
    public once = vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') {
        handler();
      }
    });
    public on = vi.fn();
    public remove = vi.fn();
    public resize = vi.fn();
    public setLayoutProperty = vi.fn();
    public setStyle = vi.fn();
    public setTerrain = vi.fn();
    public triggerRepaint = vi.fn();
  },
}));

describe('ResultMapPreview', () => {
  beforeEach(() => {
    addControl.mockClear();
    addLayer.mockClear();
    mapOptions.length = 0;
    document.documentElement.dataset.theme = 'light';
  });

  it('uses the authenticated runtime in static mode with result layers active', async () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ResultMapPreview analysisId="an_0123456789abcdef0123456789abcdef" />
      </QueryClientProvider>
    );

    expect(await screen.findByLabelText('Suitability and occurrence map preview')).toBeDefined();
    await waitFor(() => expect(mapOptions).toHaveLength(1));
    expect(mapOptions[0]?.interactive).toBe(false);
    expect(mapOptions[0]?.fitBoundsOptions?.padding).toBe(24);
    expect(addControl).not.toHaveBeenCalled();
    expect(addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ml_11111111111111111111111111111111',
        layout: { visibility: 'visible' },
        paint: expect.objectContaining({ 'raster-opacity': 0.85 }),
      })
    );

    const request = mapOptions[0]?.transformRequest;
    expect(request?.('https://basemaps.example/style.json')).toEqual({
      url: 'https://basemaps.example/style.json',
    });
    unmount();
  });
});
