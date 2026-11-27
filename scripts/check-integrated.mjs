/** Creates the patient in the UI. HYBRID_MOCK=1 uses a voice-enabled Vite dev server and intercepts the SDK and broker. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173/wasl-mvp/';
const hybrid = process.env.HYBRID_MOCK === '1';
const key = 'wasl.demo.v9';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let fontRequests = 0;
await context.route('https://fonts.googleapis.com/**', (route) => {
  fontRequests++;
  return route.fulfill({ contentType: 'text/css', body: '' });
});
if (hybrid) {
  await context.route('https://api.voice.humain.com/**', (route) => route.abort());
  await context.routeWebSocket('wss://mock.invalid/**', (socket) => socket.close());
  await context.route('http://127.0.0.1:4317/api/voice/session', (route) => {
    assert.deepEqual(route.request().postDataJSON(), { workflow: 'checkin' });
    return route.fulfill({
      status: 201,
      headers: { 'Access-Control-Allow-Origin': new URL(base).origin },
      json: { server_url: 'wss://mock.invalid', participant_token: 'mock', expires_at: new Date(Date.now() + 60000).toISOString(), duration_seconds: 50 },
    });
  });
  await context.route(/\/node_modules\/\.vite\/deps\/@humain-voice_agent\.js/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export class AgentSession {
        static async start(options) {
          options.onStatusChange('connecting');
          await options.token();
          window.waslMockVoice.options = options;
          return {
            room: { localParticipant: { publishTrack: async () => options.onModeChange('listening') } },
            end: async () => { window.waslMockVoice.disconnected++; },
          };
        }
      }
    `,
  }));
  await context.addInitScript(() => {
    window.waslMockVoice = { stopped: 0, disconnected: 0 };
    navigator.mediaDevices.getUserMedia = async () => {
      const track = { stop: () => { window.waslMockVoice.stopped++; } };
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    };
  });
}
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const go = (route) => page.goto(`${base}#${route}`);
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const tab = (name) => page.getByRole('tab', { name, exact: true });
const exact = (name, scope = page) => scope.getByText(name, { exact: true });
const state = () => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key);
const role = (name) => page.getByRole('heading', { name, exact: true });
const stopped = 'Stopped medicine reported in use';
const stopCard = () => page.getByRole('region', { name: 'Open gaps' })
  .getByRole('heading', { name: stopped, exact: true }).locator('../..');
const saved = () => exact('تم', page.getByRole('status')).waitFor();

async function selectMedicine(index, search) {
  await page.getByRole('combobox', { name: 'Medicine', exact: true }).nth(index).fill(search);
  await page.getByRole('option', { name: new RegExp(search, 'i') }).click();
}

async function submitText(answer) {
  await button('أو اكتب جوابك').click();
  await page.getByLabel('جوابك').fill(answer);
  await button('أرسل').click();
  await button('إيه صح').click();
  await saved();
}

async function startCheckin(route) {
  await go(hybrid ? `${route}?voice=humain` : route);
  if (hybrid) {
    await page.getByRole('checkbox', { name: /أوافق على إرسال صوت/ }).check();
    await button('ابدأ محادثة HUMAIN').click();
    await page.getByRole('status').filter({ hasText: 'المحادثة متصلة' }).waitFor();
  } else await button('ابدأ').click();
}

async function submitVoice(answer, intent, category) {
  const count = (await state()).evidence.length;
  await page.waitForFunction(() => window.waslMockVoice.options.clientTools.get_current_question({ scope: 'current_checkin' }).status === 'question');
  const response = await page.evaluate(({ answer, intent }) => {
    const { clientTools, onMessage } = window.waslMockVoice.options;
    const q = clientTools.get_current_question({ scope: 'current_checkin' });
    onMessage({ id: crypto.randomUUID(), role: 'user', final: true, text: answer });
    const args = { question_ref: q.question_ref, intent };
    const proposed = clientTools.propose_patient_answer(args);
    const retried = clientTools.propose_patient_answer(args);
    return { q, proposed, retried };
  }, { answer, intent });
  assert.equal(response.q.category, category);
  assert.equal(response.proposed.status, 'awaiting_confirmation');
  assert.equal(response.retried.status, 'awaiting_confirmation');
  assert.equal((await state()).evidence.length, count);
  await button('إيه صح').click();
  await page.waitForFunction((ref) => window.waslMockVoice.options.clientTools.get_answer_status({ question_ref: ref }).status === 'recorded', response.q.question_ref);
  await saved();
}

try {
  await go('/clinician/new?sample=1');
  await button('Load sample case').click();
  await selectMedicine(0, 'Apixaban');
  await page.getByLabel('Last treatment day (optional)', { exact: true }).first().fill('3');
  await selectMedicine(2, 'Insulin glargine');
  await page.getByLabel('Action', { exact: true }).nth(2).selectOption('CHANGED');
  await page.getByLabel('Previous dose').fill('Previous synthetic dose');
  await selectMedicine(4, 'Clopidogrel');
  await button('Save discharge plan').click();
  await button('Open patient').click();
  await page.waitForURL(/#\/clinician\/patient\/pt-/);
  const id = page.url().split('/').at(-1);
  const patientRoute = `/clinician/patient/${id}`;
  const checkinRoute = `/patient/${id}/checkin`;
  const stopTask = `${id}/MED_STOP/clopidogrel@d1`;
  const stableGap = `${id}:STOPPED_STILL_TAKEN:${stopTask}`;
  const current = (await state()).patients.find((patient) => patient.id === id);
  assert.equal(current.nameEn, 'Abu Saleh');
  assert.equal(current.dischargeDay, 4);
  assert(!(await state()).evidence.some((e) => e.patientId === id));
  await page.getByText(/Day 0 of \d+ after discharge/).waitFor();

  await tab('Care graph').click();
  await page.getByLabel(/Care graph timeline/).waitFor();
  await page.getByRole('button', { name: /Start Apixaban.*due Day 1/ }).waitFor();
  const continuation = page.getByRole('button', { name: /Continue Apixaban.*due Day 3/ });
  await continuation.click();
  await page.getByText(/Start Apixaban.* · Question order/).waitFor();
  const drawer = page.getByRole('dialog');
  await exact('Patient', drawer).waitFor();
  await exact('High', drawer).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: /Continue Apixaban.*due Day 7/ }).count(), 0);
  await page.getByRole('button', { name: /Kidney function.*due Day 5/i }).waitFor();
  await page.getByRole('button', { name: /Attend Cardiology clinic.*due Day 10/ }).click();
  await page.getByText(/Book Cardiology clinic.* · Context/).waitFor();
  await page.keyboard.press('Escape');
  console.log('PASS new discharge, patient-relative day, graph edge and treatment boundary');

  await startCheckin(checkinRoute);
  await page.getByText(/سؤال ١ من/).waitFor();
  if (hybrid) {
    await submitVoice('لا، مو على الجرعة الجديدة', 'NO', 'DOSE_CHECK');
    await submitVoice('إيه بديت فيه', 'YES', 'MED_START');
    await submitVoice('لا، للحين آخذه', 'STILL_TAKING', 'STOPPED_CHECK');
    await submitVoice('مدري يمكن', 'UNSURE', 'MED_START');
    await page.getByText(/سؤال ٥ من/).waitFor();
    const abandoned = await page.evaluate(() => {
      const { clientTools, onMessage } = window.waslMockVoice.options;
      const q = clientTools.get_current_question({ scope: 'current_checkin' });
      onMessage({ id: crypto.randomUUID(), role: 'user', final: true, text: 'مدري يمكن' });
      return clientTools.propose_patient_answer({ question_ref: q.question_ref, intent: 'UNSURE' });
    });
    assert.equal(abandoned.status, 'awaiting_confirmation');
    await button('إيه صح').waitFor();
    await button('أنه المحادثة').click();
    await button('إيه صح').waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => [window.waslMockVoice.stopped, window.waslMockVoice.disconnected]), [1, 1]);
  } else {
    await submitText('لا، مو على الجرعة الجديدة');
    await page.getByText(/سؤال ٢ من/).waitFor();
    await submitText('إيه بديت فيه');
    await button('لا، للحين آخذه').click();
    await saved();
    await button('مو متأكد').click();
    await saved();
    await button('لا، بس أدوية الدكتور').waitFor();
  }
  const reports = () => state().then((value) => value.evidence.filter((e) => e.patientId === id));
  const initialEvidence = await reports();
  assert.deepEqual(initialEvidence.map(({ claim }) => claim), ['NOT_DONE', 'DONE', 'STILL_TAKING', 'UNSURE']);
  if (hybrid) assert(initialEvidence.every((e) => e.source === 'patient_voice' && !e.confirmedByHuman));
  assert(initialEvidence.some((e) => e.claim === 'DONE' && e.taskId === `${id}/MED_START/apixaban@d1`));
  const presented = (await state()).audit.filter((e) => e.action === 'CHECKIN_PRESENTED' &&
    (e.target === id || e.target.startsWith(`${id}/`)));
  assert.deepEqual(presented.map((e) => e.target), [...initialEvidence.map((e) => e.taskId), id]);
  await go(patientRoute);
  await role(stopped).waitFor();
  await stopCard().getByText(/Now · open .* · priority/).waitFor();
  await stopCard().getByTitle(/Rule STOPPED_STILL_TAKEN/).waitFor();
  await role('Evidence needs clarification').waitFor();
  await role('Task reported incomplete').waitFor();
  assert.equal(await role('Previous dose reported in use').count(), 0);
  console.log('PASS four UI responses, evidence attribution and gaps; unanswered open question left');

  await button('Log call', stopCard()).click();
  await page.getByLabel('Note (optional)').fill('Synthetic contact');
  await button('Save call').click();
  await exact('In review', stopCard()).waitFor();
  await button('Document intervention', stopCard()).click();
  await page.getByLabel('Intervention note (required)').fill('Synthetic intervention');
  await button('Save intervention').click();
  await exact('Awaiting evidence', stopCard()).waitFor();
  assert(!(await reports()).some((e) => e.claim === 'STOPPED'));

  await button('Confirm what happened', stopCard()).click();
  await page.getByRole('radio', { name: 'Stopped', exact: true }).click();
  await page.getByLabel('Note (optional)').fill('New eligible confirmation');
  await button('Record confirmation').click();
  await exact('Condition cleared with eligible evidence.').waitFor();
  await button('Document evidence-supported resolution').click();
  await page.getByLabel('Resolution note (required)').fill('Synthetic evidence-supported resolution');
  await button('Save resolution').click();
  await exact('Synthetic evidence-supported resolution').waitFor();
  await tab('Expected vs actual').click();
  const stopRow = page.getByRole('row', { name: /Stop Clopidogrel/ });
  await exact('Verified', stopRow).waitFor();
  const decision = (await state()).resolutions.find((r) => r.gapId === stableGap && r.disposition === 'EVIDENCE_SUPPORTED');
  assert.equal(decision?.outcomeEvidenceIds.length, 1);
  assert((await reports()).some((e) => e.id === decision.outcomeEvidenceIds[0] && e.source === 'clinician'));

  await startCheckin(checkinRoute);
  if (hybrid) {
    await submitVoice('للحين آخذ بلافكس', 'MENTIONS_MEDS', 'OPEN_MEDS');
  } else {
    await button('لا، بس أدوية الدكتور').waitFor();
    await submitText('للحين آخذ بلافكس');
  }
  await exact('شكراً، خلّصنا ✔').waitFor();
  await go(patientRoute);
  await exact('Reopened', stopCard()).waitFor();
  assert.equal(await exact('In review', stopCard()).count(), 0);
  assert.equal(await exact('Awaiting evidence', stopCard()).count(), 0);
  const sameDay = (await state()).audit.filter((a) => a.target === stableGap);
  const first = sameDay.find((a) => a.action === 'GAP_DETECTED');
  const reopening = sameDay.filter((a) => a.action === 'GAP_REOPENED');
  assert.equal(reopening.length, 1);
  assert.notEqual(reopening[0].id, first?.id);
  assert.equal(reopening[0].day, first?.day);
  assert.deepEqual((await reports()).slice(0, initialEvidence.length), initialEvidence);
  await go('/clinician');
  await page.getByRole('list', { name: /Care gaps, highest priority/ }).getByText(/Abu Saleh/).first().waitFor();
  await go(checkinRoute);
  await role('ما فيه أسئلة إضافية اليوم').waitFor();
  console.log('PASS review, intervention, eligible re-verification, resolution and same-day reopened episode');

  await go(`${patientRoute}?tab=audit`);
  const cell = (name) => page.getByRole('cell', { name, exact: true });
  for (const label of ['Gap detected', 'Intervention documented', 'Resolution documented', 'Gap condition cleared', 'Gap reopened']) {
    await cell(label).first().waitFor();
  }
  const history = (await state()).audit;
  await page.reload();
  await cell('Gap reopened').first().waitFor();
  const reloaded = await state();
  assert.deepEqual(reloaded.audit, history);
  assert.deepEqual(reloaded.patients.find((patient) => patient.id === id), current);
  assert.equal(reloaded.evidence.filter((e) => e.patientId === id).length, 6);
  await button('Previous simulated day').click();
  await page.waitForFunction((storageKey) => JSON.parse(localStorage.getItem(storageKey)).simulatedDay === 3, key);
  assert.equal(await cell('Gap reopened').count(), 0);
  await button('Next simulated day').click();
  await cell('Gap reopened').first().waitFor();
  assert.deepEqual((await state()).audit, history);
  console.log('PASS production deep link, reload, rewind and unchanged forward projection');

  await go(patientRoute);
  await button('Mark resolved', stopCard()).click();
  await page.getByLabel('Administrative reason').selectOption('HANDED_OFF');
  await page.getByLabel('Resolution note (required)').fill('Synthetic administrative handoff');
  await page.locator('form').getByRole('button', { name: 'Mark resolved', exact: true }).click();
  await exact('Administratively closed. The underlying condition is still present.').waitFor();
  await tab('Expected vs actual').click();
  await exact('Gap closed', stopRow).waitFor();
  assert.equal(await exact('Verified', stopRow).count(), 0);
  await go('/validation');
  await exact('65/78').waitFor();
  await exact('Phase 04B').waitFor();
  assert(fontRequests > 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS discoverable high-risk administrative closure, current claims, and font fallback with no browser errors');
} finally {
  await browser.close();
}
