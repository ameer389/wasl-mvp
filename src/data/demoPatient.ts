/**
 * Placeholder synthetic patient used by the shells until the data layer lands (Phase 2).
 * Entirely fictional — not a real person.
 */
export const DEMO_PATIENT = {
  id: 'demo-001',
  displayNameEn: 'Abu Mohammed',
  displayNameAr: 'أبو محمد',
} as const;

/** English display name for a patient id (falls back to the id itself). */
export function patientDisplayNameEn(id: string): string {
  return id === DEMO_PATIENT.id ? DEMO_PATIENT.displayNameEn : id;
}
