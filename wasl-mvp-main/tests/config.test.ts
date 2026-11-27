import { describe, expect, it } from 'vitest';
import { BASE } from '../src/config';
import { patientCheckinPath, clinicianPatientPath } from '../src/routes';

describe('app config', () => {
  it('BASE is a GitHub Pages sub-path with leading and trailing slash', () => {
    expect(BASE).toBe('/wasl-mvp/');
    expect(BASE.startsWith('/')).toBe(true);
    expect(BASE.endsWith('/')).toBe(true);
  });

  it('builds patient route paths', () => {
    expect(patientCheckinPath('demo-001')).toBe('/patient/demo-001');
    expect(clinicianPatientPath('a b')).toBe('/clinician/patient/a%20b');
  });
});
