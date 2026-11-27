import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionOptions } from '@humain-voice/agent';
import { demoVoiceTools, startHumainCall, voiceExperimentEnabled } from '../../src/voice/humain';

const context = { day: 4, plannedQuestions: 3, questionAr: 'بديت الدواء؟' };
const scope = { scope: 'current_demo' };

function setup() {
  const observer = {
    status: vi.fn(), mode: vi.fn(), message: vi.fn(), warning: vi.fn(), error: vi.fn(),
    tool: vi.fn(), audioBlocked: vi.fn(), ended: vi.fn(),
  };
  const track = { stop: vi.fn(), enabled: true };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const call = { end: vi.fn(async () => {}), sendText: vi.fn(async () => {}), interrupt: vi.fn(async () => {}),
    startAudio: vi.fn(async () => {}), publishMicrophone: vi.fn(async () => ({})) };
  const token = vi.fn(async () => ({ server_url: 'wss://mock.invalid', participant_token: 'mock', duration: 12 }));
  const deps = { getMedia: vi.fn(async () => stream), token,
    connect: vi.fn(async (options: AgentSessionOptions) => { await options.token(); return call; }) };
  return { deps, track, stream, call, observer };
}

describe('HUMAIN browser experiment', () => {
  it('requires the explicit flag on a loopback origin', () => {
    expect(voiceExperimentEnabled(undefined, { hostname: 'localhost', protocol: 'http:' })).toBe(false);
    expect(voiceExperimentEnabled('true', { hostname: 'example.com', protocol: 'https:' })).toBe(false);
    expect(voiceExperimentEnabled('true', { hostname: '127.0.0.1', protocol: 'http:' })).toBe(true);
  });

  it('returns only the scoped demo context, rejects argument injection and throws after cancellation', () => {
    let active = true;
    const observed = vi.fn();
    const handlers = demoVoiceTools(context, () => active, observed);
    expect(handlers.get_demo_context(scope)).toEqual({ simulated_day: 4, planned_questions: 3 });
    expect(handlers.get_demo_question(scope)).toEqual({ available: true, question_ar: context.questionAr });
    for (const rejected of [null, [], 'wrong', {}, { scope: 'other' }, { ...scope, patientId: 'someone-else' }]) {
      expect(() => handlers.get_demo_question(rejected)).toThrow();
    }
    expect(observed).toHaveBeenCalledTimes(2);
    expect(demoVoiceTools({ day: 0, plannedQuestions: 0 }, () => true, observed).get_demo_question(scope)).toEqual({ available: false });
    active = false;
    expect(() => handlers.get_demo_context(scope)).toThrow('Demo session ended');
  });

  it('does not request a chargeable session if the microphone is denied', async () => {
    const { deps, observer } = setup();
    deps.getMedia.mockRejectedValueOnce(new Error('permission'));
    await startHumainCall(context, observer, deps).ready;
    expect(deps.connect).not.toHaveBeenCalled();
    expect(deps.token).not.toHaveBeenCalled();
    expect(observer.ended).toHaveBeenCalledWith('microphone');
  });

  it('stops late microphone access after cancellation without connecting', async () => {
    const { deps, observer, track, stream } = setup();
    let allow!: (value: MediaStream) => void;
    deps.getMedia.mockReturnValueOnce(new Promise((resolve) => { allow = resolve; }));
    const run = startHumainCall(context, observer, deps);
    run.stop();
    allow(stream);
    await run.ready;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(deps.connect).not.toHaveBeenCalled();
  });

  it('releases the microphone after a provider failure and never starts a second request', async () => {
    const { deps, observer, track } = setup();
    deps.token.mockRejectedValueOnce(new Error('offline'));
    await startHumainCall(context, observer, deps).ready;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(observer.ended).toHaveBeenCalledWith('connection');
    expect(deps.token).toHaveBeenCalledOnce();
  });

  it('cleans up a rejected connection after obtaining credentials without forwarding provider error details', async () => {
    const { deps, observer, track } = setup();
    deps.connect.mockImplementationOnce(async (options) => {
      await options.token();
      throw new Error('private transport detail');
    });
    await startHumainCall(context, observer, deps).ready;
    expect(observer.status).not.toHaveBeenCalledWith('ready');
    expect(observer.error).toHaveBeenCalledExactlyOnceWith('تعذّر بدء المحادثة الصوتية. تقدر تستخدم التشييك المعتاد.');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(deps.token).toHaveBeenCalledOnce();
  });

  it('routes SDK events and real tool handlers while active, and suppresses them after stop', async () => {
    const { deps, observer, track, call } = setup();
    const run = startHumainCall(context, observer, deps);
    await run.ready;
    const options = deps.connect.mock.calls[0]![0];
    expect(options.microphone).toBe(false);
    expect(call.publishMicrophone).toHaveBeenCalledWith(track);
    expect(observer.status).toHaveBeenCalledWith('ready');
    options.onModeChange?.('listening');
    options.onWarning?.({ cause: 'credits', seconds_left: 5 });
    expect(observer.warning).toHaveBeenCalledOnce();
    expect(options.clientTools?.get_demo_question?.(scope)).toMatchObject({ question_ar: context.questionAr });
    await run.send('تجربة');
    await run.interrupt();
    run.mute(true);
    expect(call.sendText).toHaveBeenCalledWith('تجربة');
    expect(call.interrupt).toHaveBeenCalledOnce();
    expect(track.enabled).toBe(false);
    run.stop();
    run.stop();
    options.onModeChange?.('speaking');
    options.onError?.({ code: 'CLIENT_TOOL_FAILED', message: 'private cause', name: 'Error' });
    expect(observer.mode).toHaveBeenCalledExactlyOnceWith('listening');
    expect(observer.error).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(call.end).toHaveBeenCalledOnce();
  });

  it('closes a transport that finishes connecting after the user leaves without publishing the microphone', async () => {
    const { deps, observer, track, call } = setup();
    let finish!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => { finish = resolve; });
    const connecting = new Promise<void>((resolve) => { started = resolve; });
    deps.connect.mockImplementationOnce(async (options) => {
      await options.token();
      started();
      await blocked;
      return call;
    });
    const run = startHumainCall(context, observer, deps);
    await connecting;
    run.stop();
    expect(track.stop).toHaveBeenCalledOnce();
    finish();
    await run.ready;
    expect(call.end).toHaveBeenCalledOnce();
    expect(call.publishMicrophone).not.toHaveBeenCalled();
    expect(observer.status).not.toHaveBeenCalledWith('ready');
  });

  it('ends the call and releases its track at the broker duration limit', async () => {
    vi.useFakeTimers();
    try {
      const { deps, observer, track, call } = setup();
      await startHumainCall(context, observer, deps).ready;
      await vi.advanceTimersByTimeAsync(12000);
      expect(track.stop).toHaveBeenCalledOnce();
      expect(call.end).toHaveBeenCalledOnce();
      expect(observer.ended).toHaveBeenCalledWith('local_duration');
      expect(deps.token).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
