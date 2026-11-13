import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** Length of the simulated post-discharge follow-up window, in days. */
export const FOLLOW_UP_DAYS = 14;

/** Clamp a day index into [0, FOLLOW_UP_DAYS]. Day 0 = discharge day. */
export function clampDay(day: number): number {
  return Math.min(FOLLOW_UP_DAYS, Math.max(0, Math.round(day)));
}

interface SimulatedDayApi {
  day: number;
  totalDays: number;
  setDay: (day: number) => void;
  next: () => void;
  prev: () => void;
}

const SimulatedDayContext = createContext<SimulatedDayApi | null>(null);

/**
 * Simulated clock (days since discharge). Not real time.
 * In-memory only for now; persistence arrives with the demo store.
 */
export function SimulatedDayProvider({ children, initialDay = 0 }: { children: ReactNode; initialDay?: number }) {
  const [day, setDayRaw] = useState(() => clampDay(initialDay));
  const setDay = useCallback((d: number) => setDayRaw(clampDay(d)), []);
  const next = useCallback(() => setDayRaw((d) => clampDay(d + 1)), []);
  const prev = useCallback(() => setDayRaw((d) => clampDay(d - 1)), []);

  const api = useMemo(() => ({ day, totalDays: FOLLOW_UP_DAYS, setDay, next, prev }), [day, setDay, next, prev]);
  return <SimulatedDayContext.Provider value={api}>{children}</SimulatedDayContext.Provider>;
}

export function useSimulatedDay(): SimulatedDayApi {
  const ctx = useContext(SimulatedDayContext);
  if (!ctx) throw new Error('useSimulatedDay must be used inside <SimulatedDayProvider>');
  return ctx;
}
