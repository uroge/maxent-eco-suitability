'use client';

import { useEffect } from 'react';
import { appearanceStorageKey, applyAppearance, getStoredAppearance } from '@/appearance';

export function AppearanceController() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const synchronizeSystemTheme = () => {
      if (document.documentElement.dataset.appearance === 'system') {
        document.documentElement.dataset.theme = mediaQuery.matches ? 'dark' : 'light';
      }
    };
    const synchronizeStoredAppearance = (event: StorageEvent) => {
      if (event.key === null || event.key === appearanceStorageKey) {
        applyAppearance(getStoredAppearance(), false);
      }
    };
    mediaQuery.addEventListener('change', synchronizeSystemTheme);
    window.addEventListener('storage', synchronizeStoredAppearance);
    return () => {
      mediaQuery.removeEventListener('change', synchronizeSystemTheme);
      window.removeEventListener('storage', synchronizeStoredAppearance);
    };
  }, []);

  return null;
}
