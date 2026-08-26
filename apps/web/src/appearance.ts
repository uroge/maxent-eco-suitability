export type Appearance = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<Appearance, 'system'>;

export const appearanceStorageKey = 'app:appearance';

export function resolveTheme(appearance: Appearance, prefersDark: boolean): ResolvedTheme {
  return appearance === 'system' ? (prefersDark ? 'dark' : 'light') : appearance;
}

export function getStoredAppearance(): Appearance {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const value = window.localStorage.getItem(appearanceStorageKey);

  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

let mediaQuery: MediaQueryList | undefined;
let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;

export function applyAppearance(appearance: Appearance, persist = true) {
  if (typeof window === 'undefined') {
    return;
  }

  mediaQuery ??= window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.dataset.theme = resolveTheme(appearance, mediaQuery.matches);

  if (persist) {
    window.localStorage.setItem(appearanceStorageKey, appearance);
  }

  if (mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener);
  }

  mediaListener = (event) => {
    if (document.documentElement.dataset.appearance === 'system') {
      document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
    }
  };
  mediaQuery.addEventListener('change', mediaListener);
}

export const appearanceBootstrapScript = `(() => {
  const key = '${appearanceStorageKey}';
  const root = document.documentElement;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const stored = localStorage.getItem(key);
  const appearance = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  const apply = () => {
    root.dataset.appearance = appearance;
    root.dataset.theme = appearance === 'system' ? (query.matches ? 'dark' : 'light') : appearance;
  };
  apply();
  query.addEventListener('change', () => {
    if (root.dataset.appearance === 'system') {
      apply();
    }
  });
})();`;
