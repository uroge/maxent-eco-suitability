export type MapTokenGetter = (options?: { skipCache?: boolean }) => Promise<string | null>;

type MapTokenController = {
  current: () => string | null;
  start: () => Promise<void>;
  stop: () => void;
};

const refreshBufferMilliseconds = 15_000;

const fallbackRefreshMilliseconds = 30_000;

const retryRefreshMilliseconds = 5_000;

const minimumRefreshMilliseconds = 1_000;

const tokenExpiration = (token: string): number | undefined => {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return undefined;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(window.atob(padded)) as { exp?: unknown };
    return typeof parsed.exp === 'number' ? parsed.exp * 1_000 : undefined;
  } catch {
    return undefined;
  }
};

export const createMapTokenController = (getToken: MapTokenGetter): MapTokenController => {
  let active = false;
  let token: string | null = null;
  let timeout: number | undefined;
  let refreshPromise: Promise<void> | undefined;

  const clearRefresh = (): void => {
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      timeout = undefined;
    }
  };

  const schedule = (milliseconds: number, refresh: () => Promise<void>): void => {
    clearRefresh();
    if (active) {
      timeout = window.setTimeout(() => void refresh(), milliseconds);
    }
  };

  const nextRefreshDelay = (value: string): number => {
    const expiration = tokenExpiration(value);
    return expiration === undefined
      ? fallbackRefreshMilliseconds
      : Math.max(minimumRefreshMilliseconds, expiration - Date.now() - refreshBufferMilliseconds);
  };

  const refresh = async (force = true, initial = false): Promise<void> => {
    if (refreshPromise) {
      return refreshPromise;
    }
    refreshPromise = (async () => {
      try {
        const next = await getToken(force ? { skipCache: true } : undefined);
        if (!active) {
          return;
        }
        token = next;
        schedule(next ? nextRefreshDelay(next) : retryRefreshMilliseconds, () => refresh(true));
      } catch (error) {
        if (active) {
          schedule(retryRefreshMilliseconds, () => refresh(true));
        }
        if (initial) {
          throw error;
        }
      }
    })().finally(() => {
      refreshPromise = undefined;
    });
    return refreshPromise;
  };

  const refreshWhenActive = (): void => {
    if (document.visibilityState === 'visible') {
      void refresh(true);
    }
  };

  const start = async (): Promise<void> => {
    if (active) {
      return;
    }
    active = true;
    window.addEventListener('focus', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);
    await refresh(false, true);
  };

  const stop = (): void => {
    active = false;
    clearRefresh();
    window.removeEventListener('focus', refreshWhenActive);
    document.removeEventListener('visibilitychange', refreshWhenActive);
  };

  return {
    current: () => token,
    start,
    stop,
  };
};
