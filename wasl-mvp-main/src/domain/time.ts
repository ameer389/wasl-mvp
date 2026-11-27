import type { Day } from './types';

/** Length of the simulated post-discharge follow-up window, in days. */
export const FOLLOW_UP_DAYS = 14;
export const MAX_PLAN_DAY = 30;
export const NO_RESPONSE_GRACE_DAYS = 2;
export const MAX_DISCHARGE_DAY = Number.MAX_SAFE_INTEGER - MAX_PLAN_DAY - NO_RESPONSE_GRACE_DAYS;

export function isDay(value: unknown, max = Number.MAX_SAFE_INTEGER): value is Day {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

/** Clamp a day index into the usable clock range. Day 0 = first discharge day. */
export function clampDay(day: Day, lastDay = FOLLOW_UP_DAYS): Day {
  return Number.isFinite(day) ? Math.min(lastDay, Math.max(0, Math.round(day))) : 0;
}

/** A patient's own day since discharge, from the global simulated day. Negative = not yet discharged. */
export function patientDay(globalDay: Day, dischargeDay: Day = 0): Day {
  return globalDay - dischargeDay;
}
