import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapScreen } from './MapScreen';

const setStyle = vi.fn();
const eventHandlers = new Map<string, () => void>();

vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  }
);

vi.mock('@ecosuitability/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ecosuitability/ui')>();
  return { ...original, Slider: () => <div aria-label="Raster opacity" /> };
});

vi.mock('@clerk/nextjs', () => {
  const authentication = { getToken: vi.fn().mockResolvedValue('token') };
  return { useAuth: () => authentication };
});

vi.mock('../analysis/api', () => ({
  analysisKeys: { map: (id: string) => ['map', id] },
  useAnalysisApi: (() => {
    const api = {
      json: vi.fn().mockResolvedValue({
        capabilities: {
          analysisId: 'an_0123456789abcdef0123456789abcdef',
          basemaps: [
            {
              id: 'light',
              label: 'Light',
              styleUrl: 'https://maps.example/light.json',
              darkStyleUrl: 'https://maps.example/dark.json',
              attribution: 'Example Maps',
            },
            {
              id: 'satellite',
              label: 'Satellite',
              styleUrl: 'https://maps.example/satellite.json',
              darkStyleUrl: null,
              attribution: 'Satellite Provider',
            },
          ],
          layers: [
            {
              id: 'ml_11111111111111111111111111111111',
              label: 'Elevation',
              kind: 'predictor',
              dataType: 'raster',
              legend: [
                { label: '100', value: 100, color: '#440154' },
                { label: '500', value: 500, color: '#fde725' },
              ],
            },
          ],
          terrain: { available: false, layerId: null, unavailableReason: 'No DEM selected.' },
          bounds: [-10, -10, 10, 10],
        },
      }),
    };
    return () => api;
  })(),
}));

vi.mock('maplibre-gl', () => ({
  NavigationControl: class NavigationControl {},
  Map: class Map {
    public addControl = vi.fn();
    public addLayer = vi.fn();
    public addSource = vi.fn();
    public easeTo = vi.fn();
    public fitBounds = vi.fn();
    public getLayer = vi.fn().mockReturnValue(undefined);
    public getSource = vi.fn().mockReturnValue(undefined);
    public isStyleLoaded = vi.fn().mockReturnValue(false);
    public remove = vi.fn();
    public resize = vi.fn();
    public setLayoutProperty = vi.fn();
    public setPaintProperty = vi.fn();
    public setTerrain = vi.fn();
    public setStyle = setStyle;
    public triggerRepaint = vi.fn();
    public on = vi.fn((event: string, handler: () => void) => {
      eventHandlers.set(event, handler);
      if (event === 'style.load') {
        handler();
      }
    });
  },
}));

describe('MapScreen', () => {
  beforeEach(() => {
    setStyle.mockClear();
    eventHandlers.clear();
    document.documentElement.dataset.theme = 'light';
  });

  it('switches configured basemaps, shows attribution, and reapplies the dark style after load', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MapScreen analysisId="an_0123456789abcdef0123456789abcdef" />
      </QueryClientProvider>
    );

    expect(await screen.findAllByText('Example Maps')).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Layers' })).not.toHaveLength(0);
    const selectors = screen.getAllByRole('combobox', { name: 'Basemap' });
    fireEvent.change(selectors[0]!, { target: { value: 'satellite' } });
    await waitFor(() =>
      expect(setStyle).toHaveBeenCalledWith('https://maps.example/satellite.json')
    );

    fireEvent.change(selectors[0]!, { target: { value: 'light' } });
    document.documentElement.dataset.theme = 'dark';
    await waitFor(() => expect(setStyle).toHaveBeenCalledWith('https://maps.example/dark.json'));
  });
});
