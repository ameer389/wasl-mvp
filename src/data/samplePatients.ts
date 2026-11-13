/**
 * SYNTHETIC demo data. Every patient, hospital, team and answer below is
 * fictional — no real people, no real records. Hospital names are deliberately
 * generic ("Demo …"). Doses are part of each fictional plan, not advice.
 *
 * Each patient is built to show one behaviour of the gap engine by Day 4:
 *   demo-001 Abu Mohammed  → STOPPED_STILL_TAKEN + LOW_CONFIDENCE (transfer, two prescribers)
 *   demo-002 Umm Khalid    → DUPLICATE_THERAPY (own Panadol + paracetamol/codeine)
 *   demo-003 Abu Fahad     → WRONG_DOSE (insulin dose change)
 *   demo-004 Umm Sarah     → LAB_MISSED (kidney function, lab feed silent)
 *   demo-005 Abu Abdullah  → NO_RESPONSE (never answers)
 *   demo-006 Umm Nasser    → no gaps (everything verified — the system stays quiet)
 */
import { makeAudit } from '../domain/audit';
import { taskId } from '../domain/careGraph';
import { SOURCE_LABEL } from '../domain/gapEngine';
import type { AuditEntry, Evidence, Patient } from '../domain/types';

export const DEMO_PATIENT_ID = 'demo-001';

/** Simulated day the demo opens on (all seeded evidence is on Days 0–4). */
export const SEED_DAY = 4;

/** Fixed synthetic discharge timestamp used for seeded audit entries. */
const SEED_AT = '2026-11-09T10:00:00.000Z';

const GENERAL = 'Demo General Hospital';
const CARDIAC = 'Demo Cardiac Centre';

export const SAMPLE_PATIENTS: Patient[] = [
  {
    id: 'demo-001',
    nameEn: 'Abu Mohammed',
    nameAr: 'أبو محمد',
    age: 74,
    sex: 'M',
    transfer: { fromHospital: GENERAL, toHospital: CARDIAC },
    plan: {
      patientId: 'demo-001',
      hospital: CARDIAC,
      diagnosisLabel: 'New atrial fibrillation (transferred for cardiology care)',
      meds: [
        { drugId: 'apixaban', dose: '5 mg', frequency: 'twice daily', action: 'NEW', prescriber: `Cardiology · ${CARDIAC}` },
        { drugId: 'clopidogrel', dose: '75 mg', frequency: 'once daily', action: 'STOP', prescriber: `Cardiology · ${CARDIAC}` },
        { drugId: 'aspirin', dose: '81 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: `Internal medicine · ${GENERAL}` },
        { drugId: 'bisoprolol', dose: '2.5 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: `Internal medicine · ${GENERAL}` },
      ],
      labs: [{ id: 'cbc', test: 'CBC', testAr: 'الدم الشامل', dueDay: 3, linkedDrugId: 'apixaban' }],
      followUps: [{ id: 'cardiology', clinic: 'Cardiology clinic', clinicAr: 'عيادة القلب', bookByDay: 2, visitDay: 7 }],
    },
  },
  {
    id: 'demo-002',
    nameEn: 'Umm Khalid',
    nameAr: 'أم خالد',
    age: 61,
    sex: 'F',
    plan: {
      patientId: 'demo-002',
      hospital: GENERAL,
      diagnosisLabel: 'Laparoscopic cholecystectomy (post-op)',
      meds: [
        { drugId: 'paracetamol-codeine', dose: '500 mg/30 mg', frequency: 'up to 4 times daily as needed', action: 'NEW', prescriber: `General surgery · ${GENERAL}` },
        { drugId: 'amoxicillin-clavulanate', dose: '1 g', frequency: 'twice daily for 5 days', action: 'NEW', prescriber: `General surgery · ${GENERAL}` },
        { drugId: 'omeprazole', dose: '20 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: `General surgery · ${GENERAL}` },
      ],
      labs: [],
      followUps: [{ id: 'surgery', clinic: 'General surgery clinic', clinicAr: 'عيادة الجراحة', bookByDay: 3, visitDay: 10 }],
      woundCare: { instructions: 'keep the wound dry and look for redness or discharge', checkDay: 3 },
    },
  },
  {
    id: 'demo-003',
    nameEn: 'Abu Fahad',
    nameAr: 'أبو فهد',
    age: 58,
    sex: 'M',
    plan: {
      patientId: 'demo-003',
      hospital: GENERAL,
      diagnosisLabel: 'Type 2 diabetes — admitted with hyperglycaemia',
      meds: [
        { drugId: 'insulin-glargine', dose: '14 units', frequency: 'at bedtime', action: 'CHANGED', previousDose: '20 units at bedtime', prescriber: `Endocrinology · ${GENERAL}` },
        { drugId: 'metformin', dose: '1 g', frequency: 'twice daily', action: 'CONTINUE', prescriber: `Endocrinology · ${GENERAL}` },
        { drugId: 'atorvastatin', dose: '20 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: `Endocrinology · ${GENERAL}` },
      ],
      labs: [],
      followUps: [{ id: 'diabetes', clinic: 'Diabetes clinic', clinicAr: 'عيادة السكر', bookByDay: 3, visitDay: 14 }],
    },
  },
  {
    id: 'demo-004',
    nameEn: 'Umm Sarah',
    nameAr: 'أم سارة',
    age: 69,
    sex: 'F',
    plan: {
      patientId: 'demo-004',
      hospital: CARDIAC,
      diagnosisLabel: 'Heart failure exacerbation',
      meds: [
        { drugId: 'furosemide', dose: '40 mg', frequency: 'once daily', action: 'NEW', prescriber: `Cardiology · ${CARDIAC}` },
        { drugId: 'bisoprolol', dose: '5 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: `Cardiology · ${CARDIAC}` },
        { drugId: 'losartan', dose: '50 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: `Cardiology · ${CARDIAC}` },
      ],
      labs: [{ id: 'kft', test: 'Kidney function', testAr: 'وظائف الكلى', dueDay: 3, linkedDrugId: 'furosemide' }],
      followUps: [{ id: 'hf-clinic', clinic: 'Heart failure clinic', clinicAr: 'عيادة القلب', bookByDay: 2, visitDay: 7 }],
    },
  },
  {
    id: 'demo-005',
    nameEn: 'Abu Abdullah',
    nameAr: 'أبو عبدالله',
    age: 66,
    sex: 'M',
    plan: {
      patientId: 'demo-005',
      hospital: GENERAL,
      diagnosisLabel: 'Hypertensive urgency',
      meds: [
        { drugId: 'amlodipine', dose: '5 mg', frequency: 'once daily', action: 'NEW', prescriber: `Internal medicine · ${GENERAL}` },
        { drugId: 'losartan', dose: '100 mg', frequency: 'once daily', action: 'STOP', prescriber: `Internal medicine · ${GENERAL}` },
        { drugId: 'atorvastatin', dose: '40 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: `Internal medicine · ${GENERAL}` },
      ],
      labs: [],
      followUps: [{ id: 'im-clinic', clinic: 'Internal medicine clinic', clinicAr: 'عيادة الباطنية', bookByDay: 3, visitDay: 10 }],
    },
  },
  {
    id: 'demo-006',
    nameEn: 'Umm Nasser',
    nameAr: 'أم ناصر',
    age: 55,
    sex: 'F',
    plan: {
      patientId: 'demo-006',
      hospital: GENERAL,
      diagnosisLabel: 'Asthma exacerbation',
      meds: [
        { drugId: 'prednisolone', dose: '40 mg', frequency: 'once daily for 5 days', action: 'NEW', prescriber: `Pulmonology · ${GENERAL}` },
        { drugId: 'salbutamol', dose: '2 puffs', frequency: 'as needed', action: 'CONTINUE', prescriber: `Pulmonology · ${GENERAL}` },
        { drugId: 'levothyroxine', dose: '100 mcg', frequency: 'once daily', action: 'CONTINUE', prescriber: `Pulmonology · ${GENERAL}` },
      ],
      labs: [{ id: 'glucose', test: 'Blood glucose', testAr: 'السكر', dueDay: 3, linkedDrugId: 'prednisolone' }],
      followUps: [{ id: 'chest-clinic', clinic: 'Chest clinic', clinicAr: 'عيادة الصدرية', bookByDay: 2, visitDay: 7 }],
    },
  },
];

// ── Seeded evidence (Days 0–4) ───────────────────────────────────────────────

type EvidenceSeed = Omit<Evidence, 'id' | 'confirmedByHuman' | 'confidence'> & { confidence?: number };

let seq = 0;
function ev(seed: EvidenceSeed): Evidence {
  seq += 1;
  return { ...seed, id: `ev-${String(seq).padStart(3, '0')}`, confidence: seed.confidence ?? 1, confirmedByHuman: false };
}

const t = taskId;

export const SAMPLE_EVIDENCE: Evidence[] = [
  // demo-001 Abu Mohammed
  ev({ patientId: 'demo-001', taskId: t('demo-001', 'FOLLOWUP_BOOKED', 'cardiology', 2), source: 'appointment_system', day: 1, claim: 'DONE', detail: 'Cardiology clinic booked for Day 7' }),
  ev({ patientId: 'demo-001', taskId: t('demo-001', 'MED_START', 'apixaban', 1), source: 'patient_voice', day: 1, claim: 'DONE', rawText: 'إيه… أظن بديتها، ما أدري هي ولا لا', confidence: 0.55 }),
  ev({ patientId: 'demo-001', taskId: t('demo-001', 'MED_STOP', 'clopidogrel', 1), source: 'family', day: 2, claim: 'STILL_TAKING', rawText: 'لا، للحين نعطيه البلافكس كل يوم', confidence: 0.9 }),
  ev({ patientId: 'demo-001', taskId: t('demo-001', 'LAB_DONE', 'cbc', 3), source: 'lab_system', day: 3, claim: 'DONE', detail: 'CBC result received' }),
  ev({ patientId: 'demo-001', taskId: t('demo-001', 'MED_CONTINUE', 'aspirin', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-001', taskId: t('demo-001', 'MED_CONTINUE', 'bisoprolol', 3), source: 'patient_app', day: 3, claim: 'DONE' }),

  // demo-002 Umm Khalid
  ev({ patientId: 'demo-002', taskId: t('demo-002', 'MED_START', 'paracetamol-codeine', 1), source: 'patient_voice', day: 1, claim: 'DONE', rawText: 'إيه بديت المسكن', confidence: 0.91 }),
  ev({ patientId: 'demo-002', taskId: t('demo-002', 'MED_START', 'amoxicillin-clavulanate', 1), source: 'patient_app', day: 1, claim: 'DONE' }),
  ev({ patientId: 'demo-002', taskId: t('demo-002', 'FOLLOWUP_BOOKED', 'surgery', 3), source: 'appointment_system', day: 2, claim: 'DONE', detail: 'Surgery clinic booked for Day 10' }),
  ev({ patientId: 'demo-002', source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'paracetamol', rawText: 'وآخذ بنادول بعد من عندي إذا زاد الألم', confidence: 0.88 }),
  ev({ patientId: 'demo-002', taskId: t('demo-002', 'WOUND_CHECK', 'wound', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-002', taskId: t('demo-002', 'MED_CONTINUE', 'paracetamol-codeine', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-002', taskId: t('demo-002', 'MED_CONTINUE', 'amoxicillin-clavulanate', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-002', taskId: t('demo-002', 'MED_CONTINUE', 'omeprazole', 3), source: 'patient_app', day: 3, claim: 'DONE' }),

  // demo-003 Abu Fahad
  ev({ patientId: 'demo-003', taskId: t('demo-003', 'MED_DOSE_CHANGE', 'insulin-glargine', 1), source: 'patient_voice', day: 1, claim: 'OLD_DOSE', rawText: 'لا، أنا على العشرين وحدة زي قبل', confidence: 0.86 }),
  ev({ patientId: 'demo-003', taskId: t('demo-003', 'FOLLOWUP_BOOKED', 'diabetes', 3), source: 'appointment_system', day: 2, claim: 'DONE', detail: 'Diabetes clinic booked for Day 14' }),
  ev({ patientId: 'demo-003', taskId: t('demo-003', 'MED_CONTINUE', 'metformin', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-003', taskId: t('demo-003', 'MED_CONTINUE', 'atorvastatin', 3), source: 'patient_app', day: 3, claim: 'DONE' }),

  // demo-004 Umm Sarah (no lab feed result for kidney function)
  ev({ patientId: 'demo-004', taskId: t('demo-004', 'FOLLOWUP_BOOKED', 'hf-clinic', 2), source: 'appointment_system', day: 1, claim: 'DONE', detail: 'Heart failure clinic booked for Day 7' }),
  ev({ patientId: 'demo-004', taskId: t('demo-004', 'MED_START', 'furosemide', 1), source: 'patient_voice', day: 1, claim: 'DONE', rawText: 'إيه بديت حبة المويه', confidence: 0.88 }),
  ev({ patientId: 'demo-004', taskId: t('demo-004', 'MED_CONTINUE', 'bisoprolol', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-004', taskId: t('demo-004', 'MED_CONTINUE', 'losartan', 3), source: 'patient_app', day: 3, claim: 'DONE' }),

  // demo-005 Abu Abdullah (no answers at all — only the booking feed)
  ev({ patientId: 'demo-005', taskId: t('demo-005', 'FOLLOWUP_BOOKED', 'im-clinic', 3), source: 'appointment_system', day: 1, claim: 'DONE', detail: 'Internal medicine clinic booked for Day 10' }),

  // demo-006 Umm Nasser (everything verified)
  ev({ patientId: 'demo-006', taskId: t('demo-006', 'MED_START', 'prednisolone', 1), source: 'ehr', day: 0, claim: 'DONE', detail: 'Dispensed by discharge pharmacy' }),
  ev({ patientId: 'demo-006', taskId: t('demo-006', 'FOLLOWUP_BOOKED', 'chest-clinic', 2), source: 'appointment_system', day: 1, claim: 'DONE', detail: 'Chest clinic booked for Day 7' }),
  ev({ patientId: 'demo-006', taskId: t('demo-006', 'MED_START', 'prednisolone', 1), source: 'patient_voice', day: 1, claim: 'DONE', rawText: 'إيه بديت الكورتيزون الصبح', confidence: 0.94 }),
  ev({ patientId: 'demo-006', taskId: t('demo-006', 'LAB_DONE', 'glucose', 3), source: 'lab_system', day: 2, claim: 'DONE', detail: 'Blood glucose result received' }),
  ev({ patientId: 'demo-006', taskId: t('demo-006', 'MED_CONTINUE', 'prednisolone', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-006', taskId: t('demo-006', 'MED_CONTINUE', 'salbutamol', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
  ev({ patientId: 'demo-006', taskId: t('demo-006', 'MED_CONTINUE', 'levothyroxine', 3), source: 'patient_app', day: 3, claim: 'DONE' }),
];

/** Synthetic wall-clock time for a seeded event: discharge date + day, 09:00 + n minutes. */
function seedAt(day: number, minute: number): string {
  const t = new Date(SEED_AT);
  t.setUTCDate(t.getUTCDate() + day);
  t.setUTCHours(6, minute % 60, 0, 0); // 06:00 UTC = 09:00 Riyadh
  return t.toISOString();
}

/** PLAN_CREATED per patient (Day 0), then one EVIDENCE_ADDED per seeded evidence item. */
export const SEED_AUDIT: AuditEntry[] = [
  ...SAMPLE_PATIENTS.map((p) => ({
    day: 0,
    at: SEED_AT,
    actor: p.plan.hospital,
    action: 'PLAN_CREATED' as const,
    target: p.id,
    note: p.transfer ? `Transferred from ${p.transfer.fromHospital}` : undefined,
  })),
  ...SAMPLE_EVIDENCE.map((e, i) => ({
    day: e.day,
    at: seedAt(e.day, 5 + i),
    actor: SOURCE_LABEL[e.source],
    action: 'EVIDENCE_ADDED' as const,
    target: e.taskId ?? e.patientId,
    note: `${e.source}: ${e.claim}`,
  })),
].map((entry, i) => makeAudit({ ...entry, seq: i + 1 }));
