import type { Day } from './types';

/** Length of the simulated post-discharge follow-up window, in days. */
export const FOLLOW_UP_DAYS = 14;

/** Clamp a day index into [0, FOLLOW_UP_DAYS]. Day 0 = discharge day. */
export function clampDay(day: Day): Day {
  return Math.min(FOLLOW_UP_DAYS, Math.max(0, Math.round(day)));
}

/** A patient's own day since discharge, from the global simulated day. Negative = not yet discharged. */
export function patientDay(globalDay: Day, dischargeDay: Day = 0): Day {
  return globalDay - dischargeDay;
}
