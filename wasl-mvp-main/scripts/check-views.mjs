/**
 * Visual smoke check: opens key views at fixed viewports in the locally installed
 * Chrome (playwright-core, no browser download), fails on console errors or
 * horizontal page overflow, runs a few interaction checks, and saves screenshots
 * to ./screenshots (git-ignored). Every view starts from a fresh browser context,
 * i.e. the synthetic seed at Day 4.
 *
 * Usage: start `npm run dev`, then `npm run check:views`.
 * Env: APP_URL (default http://localhost:5173/wasl-mvp/), BROWSER_CHANNEL (default chrome).
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/wasl-mvp/';
const OUT = 'screenshots';
const STOP_GAP = 'demo-001:STOPPED_STILL_TAKEN:demo-001/MED_STOP/clopidogrel@d1';
/** Patient check-in helpers (typed answers: headless Chrome has no microphone). */
const startCheckin = async (page) => {
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await page.getByText(/سؤال ١ من/).waitFor();
};
const typeAnswer = async (page, text) => {
  await page.getByRole('button', { name: 'أو اكتب جوابك' }).click();
  await page.getByLabel('جوابك').fill(text);
  await page.getByRole('button', { name: 'أرسل' }).click();
};
const answerAndConfirm = async (page, text) => {
  await typeAnswer(page, text);
  await page.getByRole('button', { name: 'إيه صح' }).click();
  await page.getByRole('status').getByText('تم', { exact: true }).waitFor();
};
const toEcho = async (page) => {
  await startCheckin(page);
  await typeAnswer(page, 'ايه للحين مستمر');
  await page.getByText(/فهمت إنك/).waitFor();
};
const toDone = async (page) => {
  await startCheckin(page);
  await answerAndConfirm(page, 'ايه للحين مستمر');
  await page.getByText(/سؤال ٢ من/).waitFor();
  await page.getByRole('button', { name: 'لا، بس أدوية الدكتور' }).click();
  await page.getByText('شكراً، خلّصنا ✔').waitFor();
};
const loadSample = async (page) => {
  await page.getByRole('button', { name: 'Load sample case' }).click();
  await page.getByText('Executable tasks').waitFor();
};

/** slide: true → viewport-only 1440×900 screenshot for the deck. */
const VIEWS = [
  // Slide-ready (1440×900, Day 4)
  { name: 'slide-1-care-gaps-queue', hash: '/clinician', width: 1440, height: 900, slide: true },
  { name: 'slide-2-patient-overview-demo-001', hash: `/clinician/patient/demo-001?gap=${encodeURIComponent(STOP_GAP)}`, width: 1440, height: 900, slide: true, wait: 900 },
  { name: 'slide-3-care-graph-demo-001', hash: '/clinician/patient/demo-001?tab=care-graph', width: 1440, height: 900, slide: true },
  { name: 'slide-4-expected-vs-actual-demo-002', hash: '/clinician/patient/demo-002?tab=expected', width: 1440, height: 900, slide: true },
  { name: 'slide-5-new-discharge-sample', hash: '/clinician/new', width: 1440, height: 900, slide: true, before: loadSample },
  { name: 'slide-6-patients-list', hash: '/clinician/patients', width: 1440, height: 900, slide: true },
  { name: 'slide-7-patient-today', hash: '/patient/demo-001', width: 1440, height: 900, slide: true },
  { name: 'slide-8-patient-question', hash: '/patient/demo-001/checkin', width: 1440, height: 900, slide: true, before: startCheckin },
  { name: 'slide-9-patient-echo', hash: '/patient/demo-001/checkin', width: 1440, height: 900, slide: true, before: toEcho },
  { name: 'slide-10-patient-done', hash: '/patient/demo-001/checkin', width: 1440, height: 900, slide: true, before: toDone, wait: 1200 },
  { name: 'slide-11-patient-meds', hash: '/patient/demo-001/meds', width: 1440, height: 900, slide: true },
  { name: 'slide-12-care-graph-fit-demo-001', hash: '/clinician/patient/demo-001?tab=care-graph', width: 1440, height: 900, slide: true },
  { name: 'slide-13-launcher-guided-demo', hash: '/', width: 1440, height: 900, slide: true },
  { name: 'slide-17-validation-top', hash: '/validation', width: 1440, height: 900, slide: true },
  { name: 'validation-full-page-1440', hash: '/validation', width: 1440, height: 900 },
  { name: 'console-first-visit-hint-1280', hash: '/clinician', width: 1280, height: 800, firstVisit: true },
  // Overflow / regression checks
  { name: 'launcher-1440', hash: '/', width: 1440, height: 900 },
  { name: 'launcher-1280', hash: '/', width: 1280, height: 800 },
  { name: 'console-care-gaps-1280', hash: '/clinician', width: 1280, height: 800 },
  { name: 'console-icon-rail-1000', hash: '/clinician', width: 1000, height: 800 },
  { name: 'console-patients-1280', hash: '/clinician/patients', width: 1280, height: 800 },
  { name: 'console-overview-1280', hash: '/clinician/patient/demo-001', width: 1280, height: 800 },
  { name: 'console-care-graph-1280', hash: '/clinician/patient/demo-001?tab=care-graph', width: 1280, height: 800 },
  { name: 'console-expected-1280', hash: '/clinician/patient/demo-002?tab=expected', width: 1280, height: 800 },
  { name: 'console-audit-1280', hash: '/clinician/patient/demo-001?tab=audit', width: 1280, height: 800 },
  { name: 'console-new-discharge-1280', hash: '/clinician/new', width: 1280, height: 800, before: loadSample },
  { name: 'console-about-1280', hash: '/about', width: 1280, height: 800 },
  { name: 'console-unknown-patient-1280', hash: '/clinician/patient/nobody', width: 1280, height: 800 },
  { name: 'patient-mobile-390', hash: '/patient/demo-001', width: 390, height: 844, mobile: true },
  { name: 'patient-checkin-mobile-390', hash: '/patient/demo-001/checkin', width: 390, height: 844, mobile: true, before: startCheckin },
  { name: 'patient-appointments-mobile-390', hash: '/patient/demo-001/appointments', width: 390, height: 844, mobile: true },
  { name: 'patient-help-mobile-390', hash: '/patient/demo-004/help', width: 390, height: 844, mobile: true },
  { name: 'console-care-graph-fit-1280', hash: '/clinician/patient/demo-001?tab=care-graph', width: 1280, height: 800 },
  { name: 'patient-frame-1440', hash: '/patient/demo-001', width: 1440, height: 1000 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
let failures = 0;
const report = (ok, label, extra = []) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  extra.forEach((line) => console.log(`      ${line}`));
};

async function newPage(width, height, mobile = false, firstVisit = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  // The first-visit day hint is shown once per browser; most checks start "after" it.
  if (!firstVisit) await context.addInitScript(() => localStorage.setItem('wasl.ui.dayHintSeen', 'true'));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`console error: ${msg.text()}`));
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  return { context, page, errors };
}

for (const view of VIEWS) {
  const { context, page, errors } = await newPage(view.width, view.height, Boolean(view.mobile), Boolean(view.firstVisit));
  await page.goto(`${APP_URL}#${view.hash}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (view.before) await view.before(page);
  if (view.wait) await page.waitForTimeout(view.wait);

  // Horizontal overflow on the page or any page-level scroll container (inner scrollers are fine).
  const overflow = await page.evaluate(() => {
    const offenders = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) offenders.push(`document ${doc.scrollWidth}>${doc.clientWidth}`);
    for (const el of document.querySelectorAll('main, aside, header, nav')) {
      const style = getComputedStyle(el);
      if (style.overflowX !== 'visible' && style.overflowX !== 'hidden' && el.scrollWidth > el.clientWidth + 1 && el.getAttribute('role') !== 'tablist') {
        offenders.push(`${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`);
      }
    }
    const main = document.querySelector('main');
    if (main && main.scrollWidth > main.clientWidth + 1) offenders.push(`main content ${main.scrollWidth}>${main.clientWidth}`);
    return offenders;
  });

  await page.screenshot({ path: `${OUT}/${view.name}.png`, fullPage: !view.slide });
  report(errors.length === 0 && overflow.length === 0, `${view.name.padEnd(38)} ${view.width}x${view.height}`, [
    ...errors,
    ...overflow.map((o) => `horizontal overflow: ${o}`),
  ]);
  await context.close();
}

// ── Interactions ─────────────────────────────────────────────────────────────
/** Wait (up to 5s) for a locator to become visible; true/false instead of throwing. */
const visible = (locator) => locator.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
const dayOf = async (page) =>
  Number(
    (await page.getByRole('group', { name: 'Simulated day since discharge' }).innerText()).replace(/\s+/g, ' ').match(/Day (\d+) of/)?.[1],
  );

{
  // Day stepper persists across reload; Reset demo restores the seed with Undo.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/clinician`, { waitUntil: 'networkidle' });
  const seedDay = await dayOf(page);
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  const advanced = await dayOf(page);
  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await dayOf(page);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  const undo = await visible(page.getByRole('button', { name: 'Undo' }));
  const afterReset = await dayOf(page);
  report(
    advanced === seedDay + 2 && afterReload === advanced && afterReset === seedDay && undo && errors.length === 0,
    `day stepper: ${seedDay} → ]] ${advanced} → reload ${afterReload} → reset ${afterReset}, undo ${undo}`,
    errors,
  );
  await context.close();
}

{
  // Queue keyboard: j moves, Enter opens the selected gap with ?gap=.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/clinician`, { waitUntil: 'networkidle' });
  await page.keyboard.press('j');
  await page.keyboard.press('Enter');
  await page.waitForURL(/clinician\/patient\/.+\?gap=/);
  const url = decodeURIComponent(page.url());
  report(/\?gap=demo-003:WRONG_DOSE/.test(url) && errors.length === 0, `queue keyboard: j + Enter → ${url.split('#')[1]}`, errors);
  await context.close();
}

{
  // Resolve flow: note required → gap leaves the queue → Undo restores it.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/clinician/patient/demo-001`, { waitUntil: 'networkidle' });
  const badge = () => page.getByRole('link', { name: /Care gaps/ }).innerText();
  const before = (await badge()).trim();
  await page.getByRole('button', { name: 'Mark resolved' }).first().click();
  const submit = page.locator('form').getByRole('button', { name: 'Mark resolved' });
  const disabledWithoutNote = await submit.isDisabled();
  await page.getByLabel('Resolution note (required)').fill('Spoke with son; clopidogrel removed from the pill box.');
  const disabledWithoutReason = await submit.isDisabled();
  await page.getByLabel('Administrative reason').selectOption('FOLLOW_UP_ARRANGED');
  await submit.click();
  const after = (await badge()).trim();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undone = (await badge()).trim();
  report(
    disabledWithoutNote && disabledWithoutReason && before !== after && undone === before && errors.length === 0,
    `resolve flow: badge "${before}" → "${after}" → undo "${undone}", note and reason required ${disabledWithoutNote && disabledWithoutReason}`,
    errors,
  );
  await context.close();
}

{
  // Confirm flow: recording "Stopped" removes the STOPPED_STILL_TAKEN gap and verifies the task.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/clinician/patient/demo-001?gap=${encodeURIComponent(STOP_GAP)}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Confirm what happened' }).first().click();
  await page.getByRole('radio', { name: 'Stopped' }).click();
  await page.getByRole('button', { name: 'Record confirmation' }).click();
  const activeStop = page.getByRole('heading', { name: 'Stopped medicine reported in use', exact: true });
  await activeStop.waitFor({ state: 'hidden' });
  const stillThere = await activeStop.count();
  await page.getByRole('tab', { name: 'Audit trail' }).click();
  const audited = await visible(page.getByRole('cell', { name: 'Care coordinator (demo)' }).or(page.getByText('Care coordinator (demo)')));
  report(stillThere === 0 && audited && errors.length === 0, `confirm flow: gap cleared ${stillThere === 0}, audited ${audited}`, errors);
  await context.close();
}

{
  // New discharge: invalid save shows errors; sample case saves and appears in the patients list.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/clinician/new`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Save discharge plan' }).click();
  const shownErrors = await page.getByText('Required').count();
  await loadSample(page);
  await page.getByRole('button', { name: 'Save discharge plan' }).click();
  const toast = await visible(page.getByRole('button', { name: 'Open patient' }));
  await page.getByRole('button', { name: 'Open patient' }).click();
  await page.waitForURL(/clinician\/patient\/pt-007/);
  const dayBadge = await visible(page.getByText('Day 0 of 14 after discharge'));
  report(shownErrors > 0 && toast && dayBadge && errors.length === 0, `new discharge: ${shownErrors} errors shown, saved, opened pt-007 at its Day 0 ${dayBadge}`, errors);
  await context.close();
}

{
  // Care graph: clicking a node opens the drawer; Escape closes it.
  const { context, page, errors } = await newPage(1280, 800);
  await page.goto(`${APP_URL}#/clinician/patient/demo-001?tab=care-graph`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Stop Clopidogrel, due Day 1/ }).click();
  const open = await visible(page.getByRole('dialog'));
  const provenance = await visible(page.getByRole('dialog').getByText('Family report'));
  await page.keyboard.press('Escape');
  const closed = (await page.getByRole('dialog').count()) === 0;
  report(open && provenance && closed && errors.length === 0, `care graph drawer: open ${open}, provenance ${provenance}, Escape closes ${closed}`, errors);
  await context.close();
}

// ── Patient check-in → console (end to end, typed answers) ──────────────────
const queueRows = async (page) => {
  await page.goto(`${APP_URL}#/clinician`, { waitUntil: 'networkidle' });
  const list = page.getByRole('list', { name: /Care gaps/ });
  await list.waitFor();
  return list.locator(':scope > li').allInnerTexts();
};

{
  // 1. Abu Abdullah says he has not started amlodipine → NOT_STARTED replaces NO_RESPONSE for that task.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/patient/demo-005/checkin`, { waitUntil: 'networkidle' });
  await startCheckin(page);
  const question = await page.getByRole('heading', { level: 1 }).innerText();
  await answerAndConfirm(page, 'لا والله ما بديتها');
  const rows = await queueRows(page);
  const notStarted = rows.some((r) => r.includes('Abu Abdullah') && r.includes('New medicine reported not started') && r.includes('Start Amlodipine'));
  const noResponseForIt = rows.some((r) => r.includes('Abu Abdullah') && r.includes('No response') && r.includes('Start Amlodipine'));
  report(notStarted && !noResponseForIt && errors.length === 0, `E2E 1 demo-005 «${question}» → «لا والله ما بديتها»: NOT_STARTED ${notStarted}, NO_RESPONSE for that task gone ${!noResponseForIt}`, errors);
  await context.close();
}

{
  // 2. Abu Mohammed's low-confidence start report stays with the team until clinical confirmation.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/patient/demo-001/checkin`, { waitUntil: 'networkidle' });
  await startCheckin(page);
  const routedNotRepeated = !(await page.getByRole('heading', { level: 1 }).innerText()).includes('بديت');
  await page.goto(`${APP_URL}#/clinician/patient/demo-001`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Stopped medicine reported in use' }).waitFor();
  await page.getByRole('button', { name: 'Confirm what happened' }).last().click();
  await page.getByRole('radio', { name: 'Started', exact: true }).click();
  await page.getByRole('button', { name: 'Record confirmation' }).click();
  const activeReview = page.getByRole('heading', { name: 'Evidence needs clarification', exact: true });
  await activeReview.waitFor({ state: 'hidden' });
  const lowConf = await activeReview.count();
  await page.goto(`${APP_URL}#/clinician/patient/demo-001?tab=expected`, { waitUntil: 'networkidle' });
  const row = page.getByRole('row', { name: /Start Apixaban/ });
  await row.waitFor();
  const verified = (await row.innerText()).includes('Verified');
  report(routedNotRepeated && lowConf === 0 && verified && errors.length === 0, `E2E 2 demo-001 routed report not repeated ${routedNotRepeated}, LOW_CONFIDENCE closed ${lowConf === 0}, task Verified ${verified}`, errors);
  await context.close();
}

{
  // 3. A vague typed answer is saved with low confidence → LOW_CONFIDENCE appears for a human.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/patient/demo-005/checkin`, { waitUntil: 'networkidle' });
  await startCheckin(page);
  await typeAnswer(page, 'يمكن، ما ادري');
  const nurse = await visible(page.getByText('الجواب يحتاج مراجعة داخل العرض التجريبي'));
  await page.getByRole('button', { name: 'إيه صح' }).click();
  await page.getByRole('status').getByText('تم', { exact: true }).waitFor();
  const rows = await queueRows(page);
  const low = rows.some((r) => r.includes('Abu Abdullah') && r.includes('Evidence needs clarification') && r.includes('Start Amlodipine'));
  report(nurse && low && errors.length === 0, `E2E 3 demo-005 «يمكن، ما ادري»: nurse message ${nurse}, LOW_CONFIDENCE in queue ${low}`, errors);
  await context.close();
}

{
  // Family mode: third-person questions, remembered per patient, evidence recorded as family.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/patient/demo-001`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'القائمة' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'أنا من أهل المريض' }).click();
  await page.goto(`${APP_URL}#/patient/demo-001/checkin`, { waitUntil: 'networkidle' });
  await startCheckin(page);
  const q = await page.getByRole('heading', { level: 1 }).innerText();
  await answerAndConfirm(page, 'ايه للحين مستمر');
  await page.goto(`${APP_URL}#/clinician/patient/demo-001?tab=audit`, { waitUntil: 'networkidle' });
  const familyAudit = await visible(page.getByText('Family (patient app)'));
  report(q.includes('أبو محمد') && familyAudit && errors.length === 0, `family mode: «${q}», audited as family ${familyAudit}`, errors);
  await context.close();
}

// ── Guided demo: full walkthrough ────────────────────────────────────────────
{
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start the guided demo' }).click();
  const panel = page.getByRole('complementary', { name: 'Guided demo' });
  const EXPECT = [
    { hash: '#/', target: 'launcher', day: null },
    { hash: '#/clinician/new?sample=1', target: 'task-preview', day: 2, shot: 'slide-14-tour-step-2-plan-to-tasks' },
    { hash: '#/clinician/patient/demo-001?tab=care-graph', target: 'care-graph', day: 2 },
    { hash: '#/patient/demo-001/checkin', target: 'checkin', day: null },
    { hash: '#/clinician', target: 'queue-top', day: 4, shot: 'slide-15-tour-step-5-queue' },
    { hash: '#/clinician/patient/demo-001?gap=', target: 'gap-reasons', day: 4, shot: 'slide-16-tour-step-6-explains-itself' },
    { hash: '#/clinician/patient/demo-001?gap=', target: 'gap-actions', day: 4 },
    { hash: '#/validation', target: 'validation-summary', day: 4 },
  ];
  const problems = [];
  for (let i = 0; i < EXPECT.length; i++) {
    const e = EXPECT[i];
    await panel.getByText(`Step ${i + 1} of 8`).waitFor();
    const target = page.locator(`[data-tour="${e.target}"]`).first();
    await target.waitFor({ state: 'visible', timeout: 8000 }).catch(() => problems.push(`step ${i + 1}: target ${e.target} not visible`));
    await page.waitForTimeout(450); // let the highlight settle
    const url = decodeURIComponent(page.url());
    if (!url.includes(e.hash)) problems.push(`step ${i + 1}: at ${url.split('#')[1]}, expected ${e.hash}`);
    if (e.day !== null && (await dayOf(page)) !== e.day) problems.push(`step ${i + 1}: day ${await dayOf(page)}, expected ${e.day}`);
    const [a, b] = await Promise.all([panel.boundingBox(), target.boundingBox()]);
    const overlap = a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    if (overlap) problems.push(`step ${i + 1}: panel covers the highlighted element`);
    if (e.shot) await page.screenshot({ path: `${OUT}/${e.shot}.png` });
    await panel.getByRole('button', { name: i === EXPECT.length - 1 ? 'Finish' : 'Next' }).click();
  }
  const closing = await visible(panel.getByText('That is WASL in 8 steps'));
  await panel.getByRole('button', { name: 'Explore freely' }).click();
  await page.waitForURL(/#\/clinician$/);
  const gone = (await page.getByRole('complementary', { name: 'Guided demo' }).count()) === 0;
  report(problems.length === 0 && closing && gone && errors.length === 0, `guided demo: 8 steps walked, closing card ${closing}, exits to the console ${gone}`, [...problems, ...errors]);
  await context.close();
}

{
  // Tour survives a reload and can be exited and resumed from the launcher.
  const { context, page, errors } = await newPage(1440, 900);
  await page.goto(`${APP_URL}#/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start the guided demo' }).click();
  const panel = page.getByRole('complementary', { name: 'Guided demo' });
  await panel.getByRole('button', { name: 'Next' }).click();
  await panel.getByText('Step 2 of 8').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await visible(panel.getByText('Step 2 of 8'));
  await panel.getByRole('button', { name: 'Exit the guided demo' }).click();
  await page.goto(`${APP_URL}#/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Resume at step 2' }).click();
  const resumed = await visible(panel.getByText('Step 2 of 8'));
  report(afterReload && resumed && errors.length === 0, `guided demo: survives reload ${afterReload}, resumes at step 2 ${resumed}`, errors);
  await context.close();
}

await browser.close();
console.log(failures === 0 ? '\nAll view checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
