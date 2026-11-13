/** Plain-English explanations shown behind the small info icons. */
export const GLOSSARY = {
  careGraph: {
    term: 'Care graph',
    text: 'The discharge plan turned into a list of tasks on a timeline: what has to happen, who does it, by which day, and how risky it is if it is missed.',
  },
  gap: {
    term: 'Gap',
    text: 'A difference between what the discharge plan expected and what actually happened at home — for example a stopped medicine that is still being taken.',
  },
  route: {
    term: 'Route',
    text: 'Who should act and how fast. Now: a clinician today (high risk). Within 24h: a clinician by tomorrow. Patient reminder: low risk, handled in the patient app.',
  },
  confidence: {
    term: 'Confidence',
    text: 'How sure WASL is that it understood an answer (0–100%). Below 70% the answer is never trusted on its own: a person checks it.',
  },
  source: {
    term: 'Evidence source',
    text: 'Where a piece of information came from: the patient (voice or app), a family member, a hospital system feed (records, lab, appointments) or a clinician.',
  },
  simulated: {
    term: 'Simulated',
    text: 'This demo runs on synthetic patients and a simulated clock. Numbers marked "Simulated" show how the logic behaves; they are not clinical results.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

/** One plain line per console page: what it is for and what to do. Keyed by route path. */
export const PAGE_INTRO: Record<string, string> = {
  '/clinician': 'Patients who need a clinician today. Everything else WASL is already tracking. Start from the top.',
  '/clinician/patients': 'Everyone discharged in the last 14 days and how much of their plan is confirmed.',
  '/clinician/patient/:id': 'What was planned, what actually happened at home, and why WASL flagged anything.',
  '/clinician/new': 'Enter the discharge plan as written. WASL turns it into tasks with owners, deadlines and risk.',
  '/validation': 'How we tested the prototype, the numbers we got, and what has not been tested yet.',
  '/about': 'The idea in one page: expected care, what happens at home, and the gaps in between.',
};

export const DAY_HINT = 'Simulated day = days since discharge. Move forward to watch WASL catch what goes wrong at home.';
export const TODAY_INTRO_AR = 'كل يوم نسألك كم سؤال قصير عن أدويتك ومواعيدك. جاوب بصوتك أو بالأزرار، والفريق الطبي يتابع اللي يحتاج متابعة.';
