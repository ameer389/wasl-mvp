import type { AgentSessionOptions, AgentMessage, AgentMode, AgentSessionStatus, AgentWarning } from '@humain-voice/agent';

export interface DemoVoiceContext {
  day: number;
  plannedQuestions: number;
  questionAr?: string;
}

export type CheckinVoiceContext = { tools: NonNullable<AgentSessionOptions['clientTools']> };

export function demoVoiceTools(context: DemoVoiceContext, isActive: () => boolean, onTool: (name: string) => void) {
  const read = (name: string, output: object) => (args: unknown) => {
    if (!isActive()) throw new Error('Demo session ended');
    if (typeof args !== 'object' || args === null || Array.isArray(args) ||
        Object.keys(args).length !== 1 || !Object.hasOwn(args, 'scope') ||
        (args as { scope?: unknown }).scope !== 'current_demo') {
      throw new Error('This tool requires the current demo scope');
    }
    onTool(name);
    return output;
  };
  return {
    get_demo_context: read('get_demo_context', { simulated_day: context.day, planned_questions: context.plannedQuestions }),
    get_demo_question: read('get_demo_question', context.questionAr
      ? { available: true, question_ar: context.questionAr }
      : { available: false }),
  };
}

export function voiceExperimentEnabled(flag: string | undefined, location: Pick<Location, 'hostname' | 'protocol'>) {
  return flag === 'true' && location.protocol === 'http:' &&
    (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
}

const brokerErrors = {
  missing_key: 'مفتاح الخدمة غير مضبوط في الوسيط المحلي.',
  invalid_key: 'الخدمة رفضت مفتاح الاختبار.',
  agent_scope: 'مفتاح الاختبار يحتاج صلاحية agent.',
  agent_forbidden: 'ميزة المحادثة غير متاحة لهذا الحساب.',
  credits: 'الرصيد ما يكفي لبدء المحادثة.',
  provider_busy: 'وصل الحساب للحد المتزامن للمحادثات.',
  rate_limit: 'وصلت الخدمة لحد الطلبات الآن.',
  provider_configuration: 'الخدمة رفضت إعدادات المحادثة.',
  provider_unavailable: 'الوسيط ما قدر يتصل بالخدمة.',
  invalid_response: 'رد الاتصال من الخدمة غير صالح.',
  local_busy: 'فيه محادثة قيد البدء أو الإغلاق.',
  local_budget: 'وصلت المحادثات للحد المحدد لهذا التشغيل.',
};

class BrokerFailure extends Error {}

async function brokerToken(signal: AbortSignal, checkin = false) {
  let response: Response;
  try {
    response = await fetch('http://127.0.0.1:4317/api/voice/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: checkin ? '{"workflow":"checkin"}' : '{}',
      credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(18000)]),
    });
  } catch {
    throw new BrokerFailure('تعذّر الوصول إلى وسيط الصوت المحلي.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.error;
    throw new BrokerFailure(typeof code === 'string' && Object.hasOwn(brokerErrors, code)
      ? brokerErrors[code as keyof typeof brokerErrors] : 'الوسيط رفض بدء المحادثة.');
  }
  if (typeof data?.server_url !== 'string' || !data.server_url.startsWith('wss://') ||
      typeof data.participant_token !== 'string' || !(Date.parse(data.expires_at) > Date.now()) ||
      !Number.isInteger(data.duration_seconds) || data.duration_seconds < 10 || data.duration_seconds > 55) {
    throw new BrokerFailure('بيانات الاتصال المؤقتة غير صالحة أو انتهت.');
  }
  return { server_url: data.server_url as string, participant_token: data.participant_token as string, duration: data.duration_seconds as number };
}

interface VoiceCall {
  end(): Promise<void>;
  sendText(text: string): Promise<void>;
  interrupt(): Promise<void>;
  startAudio(): Promise<void>;
  publishMicrophone(track: MediaStreamTrack): Promise<unknown>;
}

interface Observer {
  status(status: AgentSessionStatus | 'permission'): void;
  mode(mode: AgentMode): void;
  message(message: AgentMessage): void;
  warning(warning: AgentWarning): void;
  error(message: string): void;
  tool(name: string): void;
  audioBlocked(): void;
  ended(reason: string): void;
}

const defaults = {
  getMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  connect: async (options: AgentSessionOptions): Promise<VoiceCall> => {
    const [{ AgentSession }, { Track }] = await Promise.all([import('@humain-voice/agent'), import('livekit-client')]);
    const call = await AgentSession.start(options);
    return {
      end: () => call.end(),
      sendText: (text) => call.sendText(text),
      interrupt: () => call.interrupt(),
      startAudio: () => call.startAudio(),
      publishMicrophone: (track) => call.room.localParticipant.publishTrack(track, { source: Track.Source.Microphone }),
    };
  },
  token: brokerToken,
};

export function startHumainCall(context: DemoVoiceContext | CheckinVoiceContext, observer: Observer, deps = defaults) {
  const abort = new AbortController();
  const isActive = () => !abort.signal.aborted;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let microphone: MediaStreamTrack | undefined;
  let call: VoiceCall | undefined;
  let connected = false;
  let stream: MediaStream | undefined;
  let brokerFailure: BrokerFailure | undefined;

  function stop(reason = 'user_left') {
    if (!isActive()) return;
    abort.abort();
    connected = false;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    if (call) void call.end().catch(() => {});
    observer.ended(reason);
  }

  const ready = (async () => {
    observer.status('permission');
    try {
      stream = await deps.getMedia();
      microphone = stream.getAudioTracks()[0];
    } catch {
      if (isActive()) {
        observer.error('الميكروفون غير متاح أو الإذن مرفوض. تقدر تستخدم التشييك المعتاد.');
        stop('microphone');
      }
      return;
    }
    if (!isActive()) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!microphone) {
      observer.error('ما حصلنا ميكروفون متاح.');
      stop('microphone');
      return;
    }
    try {
      call = await deps.connect({
        microphone: false,
        token: async () => {
          abort.signal.throwIfAborted();
          try {
            const { duration, ...credentials } = await deps.token(abort.signal, 'tools' in context);
            abort.signal.throwIfAborted();
            timer = setTimeout(() => stop('local_duration'), duration * 1000);
            return credentials;
          } catch (error) {
            if (error instanceof BrokerFailure) brokerFailure = error;
            throw error;
          }
        },
        clientTools: 'tools' in context
          ? Object.fromEntries(Object.entries(context.tools).map(([name, handler]) => [name, (args: Record<string, unknown>) => {
              if (!isActive()) return { status: 'closed' };
              observer.tool(name);
              return handler(args);
            }]))
          : demoVoiceTools(context, isActive, observer.tool),
        onStatusChange: (status) => { if (isActive() && status !== 'ready') observer.status(status); },
        onModeChange: (mode) => { if (isActive()) observer.mode(mode); },
        onMessage: (message) => { if (isActive()) observer.message(message); },
        onWarning: (warning) => { if (isActive()) observer.warning(warning); },
        onError: () => { if (isActive()) observer.error('تعذّر تنفيذ عملية داخل المحادثة.'); },
        onAudioBlocked: () => { if (isActive()) observer.audioBlocked(); },
        onEnd: ({ reason }) => stop(reason),
      });
      if (!isActive()) {
        await call.end();
        return;
      }
      await call.publishMicrophone(microphone);
      if (isActive()) {
        connected = true;
        observer.status('ready');
      }
    } catch (error) {
      if (isActive()) {
        const sdk = error as { code?: string; endReason?: string } | null;
        observer.error(brokerFailure?.message ?? (sdk?.code === 'CREDENTIALS_EXPIRED' ? 'انتهت صلاحية الاتصال المؤقت.'
          : sdk?.endReason === 'credits_exhausted' ? brokerErrors.credits
          : sdk?.endReason === 'concurrency_limit' ? brokerErrors.provider_busy
          : 'تعذّر بدء المحادثة الصوتية. تقدر تستخدم التشييك المعتاد.'));
        stop('connection');
      }
    }
  })();

  return {
    ready,
    stop,
    mute(muted: boolean) {
      if (connected && microphone) microphone.enabled = !muted;
    },
    send(text: string) { return connected ? call?.sendText(text) : undefined; },
    interrupt() { return connected ? call?.interrupt() : undefined; },
    startAudio() { return connected ? call?.startAudio() : undefined; },
  };
}
