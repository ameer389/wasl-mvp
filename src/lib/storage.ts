/** localStorage helpers that never throw (private mode, blocked storage, SSR). */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: UI preference simply isn't remembered */
  }
}

export const STORAGE_KEYS = {
  sidebarCollapsed: 'wasl.ui.sidebarCollapsed',
} as const;
