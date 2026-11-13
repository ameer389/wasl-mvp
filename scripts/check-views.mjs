/**
 * Visual smoke check: opens key views at fixed viewports in the locally installed
 * Chrome (playwright-core, no browser download), fails on console errors or
 * horizontal overflow, and saves screenshots to ./screenshots (git-ignored).
 *
 * Usage: start `npm run dev`, then `npm run check:views`.
 * Env: APP_URL (default http://localhost:5173/wasl-mvp/), BROWSER_CHANNEL (default chrome).
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/wasl-mvp/';
const OUT = 'screenshots';

const VIEWS = [
  { name: 'launcher-1440', hash: '/', width: 1440, height: 900 },
  { name: 'launcher-1280', hash: '/', width: 1280, height: 800 },
  { name: 'console-care-gaps-1440', hash: '/clinician', width: 1440, height: 900 },
  { name: 'console-care-gaps-1280', hash: '/clinician', width: 1280, height: 800 },
  { name: 'console-icon-rail-1000', hash: '/clinician', width: 1000, height: 800 },
  { name: 'console-patient-detail-1280', hash: '/clinician/patient/demo-001', width: 1280, height: 800 },
  { name: 'console-about-1280', hash: '/about', width: 1280, height: 800 },
  { name: 'patient-mobile-390', hash: '/patient/demo-001', width: 390, height: 844, mobile: true },
  { name: 'patient-frame-1440', hash: '/patient/demo-001', width: 1440, height: 1000 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
let failures = 0;

for (const view of VIEWS) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: view.mobile ? 2 : 1,
    isMobile: Boolean(view.mobile),
    hasTouch: Boolean(view.mobile),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(`${APP_URL}#${view.hash}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Horizontal overflow on the document or on any scroll container.
  const overflow = await page.evaluate(() => {
    const offenders = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) offenders.push(`document ${doc.scrollWidth}>${doc.clientWidth}`);
    for (const el of document.querySelectorAll('main, aside, header, nav')) {
      const style = getComputedStyle(el);
      if (style.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1 && el.getAttribute('role') !== 'tablist') {
        offenders.push(`${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`);
      }
    }
    return offenders;
  });

  await page.screenshot({ path: `${OUT}/${view.name}.png`, fullPage: true });

  const ok = errors.length === 0 && overflow.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${view.name.padEnd(30)} ${view.width}x${view.height}`);
  errors.forEach((e) => console.log(`      console error: ${e}`));
  overflow.forEach((o) => console.log(`      horizontal overflow: ${o}`));
  await context.close();
}

// Interaction smoke test: ] advances the simulated day (persisted across reload),
// gap counts are live, Reset demo restores the seed day and offers Undo.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${APP_URL}#/clinician`, { waitUntil: 'networkidle' });
  const stepperText = async () =>
    (await page.getByRole('group', { name: 'Simulated day since discharge' }).innerText()).replace(/\s+/g, ' ');
  const dayOf = async () => Number((await stepperText()).match(/Day (\d+) of/)?.[1]);
  const seedDay = await dayOf();
  const gapBadge = await page.getByRole('link', { name: 'Care gaps' }).innerText();
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  const advanced = await dayOf();
  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await dayOf();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  const toastVisible = await page.getByRole('button', { name: 'Undo' }).isVisible();
  const afterReset = await dayOf();
  const ok = advanced === seedDay + 2 && afterReload === advanced && afterReset === seedDay && toastVisible;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  interaction: seed day ${seedDay} → ]] ${advanced} → reload ${afterReload} → reset ${afterReset}, undo toast: ${toastVisible}, care-gaps nav: "${gapBadge.replace(/\s+/g, ' ')}"`,
  );
  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nAll view checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
