/** Run against a loopback Vite build with VITE_HUMAIN_VOICE_ENABLED=true. No provider traffic. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173/wasl-mvp/';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
await ctx.route('https://api.voice.humain.com/**', (route) => route.abort());
let brokerRequests = 0;
await ctx.route('http://127.0.0.1:4317/api/voice/session', async (route) => {
  brokerRequests++;
  assert.equal(route.request().method(), 'POST');
  assert.deepEqual(route.request().postDataJSON(), { workflow: 'checkin' });
  await route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': new URL(base).origin }, json: { error: 'missing_key' } });
});
await ctx.addInitScript(() => {
  window.mockMic = { requests: 0, stopped: 0, allow: false };
  navigator.mediaDevices.getUserMedia = async () => {
    const mic = window.mockMic;
    mic.requests++;
    if (!mic.allow) throw new DOMException('Mocked denial', 'NotAllowedError');
    const track = { stop: () => { mic.stopped++; } };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  };
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${base}#/patient/demo-001`);
  await page.getByRole('link', { name: /تشييك بالمحادثة عبر HUMAIN/ }).click();
  const start = page.getByRole('button', { name: 'ابدأ محادثة HUMAIN', exact: true });
  const original = page.getByRole('link', { name: 'استخدم التشييك المعتاد', exact: true });
  await start.waitFor();
  await original.waitFor();
  assert(await start.isDisabled());
  assert.equal(brokerRequests, 0);
  assert.equal(await page.evaluate(() => window.mockMic.requests), 0);
  const snapshot = await page.evaluate(() => localStorage.getItem('wasl.demo.v9'));

  await page.getByRole('checkbox', { name: /أوافق على إرسال صوت/ }).check();
  await start.click();
  await page.getByRole('alert').filter({ hasText: /الميكروفون غير متاح/ }).waitFor();
  assert.equal(brokerRequests, 0);
  assert.equal(await page.evaluate(() => window.mockMic.requests), 1);

  await page.evaluate(() => { window.mockMic.allow = true; });
  await start.click();
  await page.getByRole('alert').filter({ hasText: /مفتاح الخدمة غير مضبوط/ }).waitFor();
  assert.equal(brokerRequests, 1);
  assert.equal(await page.evaluate(() => window.mockMic.stopped), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('wasl.demo.v9')), snapshot);

  await original.click();
  await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
  await page.getByRole('button', { name: 'أو اكتب جوابك', exact: true }).waitFor();
  await page.getByRole('button', { name: 'أو اكتب جوابك', exact: true }).click();
  await page.getByRole('textbox', { name: 'جوابك' }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log('PASS no opt-in traffic, denied microphone, sanitized broker failure, resource release and independent WASL fallback');
} finally {
  await browser.close();
}
