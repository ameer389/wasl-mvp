import { FOLLOW_UP_DAYS } from '../domain/time';
import { useDemoStore } from './store';

/** Simulated clock (days since discharge), backed by the persisted demo store. */
export function useSimulatedDay() {
  const { state, setDay } = useDemoStore();
  const day = state.simulatedDay;
  return {
    day,
    totalDays: FOLLOW_UP_DAYS,
    setDay,
    next: () => setDay(day + 1),
    prev: () => setDay(day - 1),
  };
}
