import { describe, expect, it } from 'vitest';
import { toArabicDigits } from '../src/lib/arabicDigits';
import { findConsolePage } from '../src/routes';
import { FOLLOW_UP_DAYS, clampDay } from '../src/state/simulatedDay';

describe('toArabicDigits', () => {
  it('converts every Western digit to Arabic-Indic', () => {
    expect(toArabicDigits('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩');
  });

  it('handles numbers and leaves other characters alone', () => {
    expect(toArabicDigits(997)).toBe('٩٩٧');
    expect(toArabicDigits('0 من 3')).toBe('٠ من ٣');
  });
});

describe('clampDay', () => {
  it('keeps the simulated day inside the follow-up window', () => {
    expect(clampDay(-1)).toBe(0);
    expect(clampDay(3)).toBe(3);
    expect(clampDay(FOLLOW_UP_DAYS + 5)).toBe(FOLLOW_UP_DAYS);
  });
});

describe('findConsolePage', () => {
  it('resolves titles and breadcrumbs for console routes', () => {
    expect(findConsolePage('/clinician')?.title).toBe('Care gaps');
    expect(findConsolePage('/clinician/patient/demo-001')?.crumbs).toEqual(['Care team', 'Patients']);
    expect(findConsolePage('/patient/demo-001')).toBeUndefined();
  });
});
