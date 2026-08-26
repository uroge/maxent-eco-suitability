'use client';

import { useEffect } from 'react';
import { applyAppearance, getStoredAppearance } from '@/appearance';

export function AppearanceController() {
  useEffect(() => {
    applyAppearance(getStoredAppearance(), false);
  }, []);

  return null;
}
