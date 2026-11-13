import { readStored, writeStored } from '../lib/storage';
import { STATE_VERSION, seedState, type DemoState } from './demoState';

/** Versioned key: a new STATE_VERSION never reads an old shape. */
export const DEMO_STORAGE_KEY = `wasl.demo.v${STATE_VERSION}`;

function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DemoState>;
  return (
    v.version === STATE_VERSION &&
    Array.isArray(v.patients) &&
    Array.isArray(v.evidence) &&
    Array.isArray(v.resolutions) &&
    Array.isArray(v.audit) &&
    typeof v.simulatedDay === 'number' &&
    !!v.tour &&
    typeof v.tour.step === 'number'
  );
}

/** Saved state if valid, otherwise the synthetic seed. Never throws. */
export function loadState(): DemoState {
  const saved = readStored<unknown>(DEMO_STORAGE_KEY, null);
  return isDemoState(saved) ? saved : seedState();
}

export function saveState(state: DemoState): void {
  writeStored(DEMO_STORAGE_KEY, state);
}
