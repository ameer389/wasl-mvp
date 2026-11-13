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

async function newPage(width, height, mobile = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`console error: ${msg.text()}`));
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  return { context, page, errors };
}

for (const view of VIEWS) {
  const { context, page, errors } = await newPage(view.width, view.height, Boolean(view.mobile));
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
  await submit.click();
  const after = (await badge()).trim();
  await page.getByRole('button', { name: 'Undo' }).click();
  const undone = (await badge()).trim();
  report(
    disabledWithoutNote && before !== after && undone === before && errors.length === 0,
    `resolve flow: badge "${before}" → "${after}" → undo "${undone}", note required ${disabledWithoutNote}`,
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
  const stillThere = await page.getByRole('heading', { name: 'Stopped medicine still being taken' }).count();
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

await browser.close();
console.log(failures === 0 ? '\nAll view checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
