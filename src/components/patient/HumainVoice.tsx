import { useEffect, useRef, useState } from 'react';
import type { AgentMessage, AgentMode, AgentSessionStatus, AgentWarning } from '@humain-voice/agent';
import { Button, Card } from '../ui';
import { startHumainCall, type CheckinVoiceContext } from '../../voice/humain';

type Run = ReturnType<typeof startHumainCall>;
type Status = AgentSessionStatus | 'permission' | 'idle';
type CallSlot = { run?: Run; settled: boolean; ended: boolean };

const statusLabels: Record<Status, string> = {
  idle: 'جاهز للبدء', permission: 'بانتظار إذن الميكروفون', connecting: 'جاري الاتصال بالخدمة',
  ready: 'المحادثة متصلة', ending: 'جاري إنهاء المحادثة', ended: 'انتهت المحادثة',
};

const modeLabels: Record<AgentMode, string> = {
  listening: 'يستمع', thinking: 'يعالج الرد', speaking: 'يتكلم',
};

type Session = { context: CheckinVoiceContext; message: (message: AgentMessage) => void; connected: () => void; ended: () => void };

export default function HumainVoice({ begin, finished }: { begin: () => Session; finished: boolean }) {
  const slot = useRef<CallSlot | null>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [mode, setMode] = useState<AgentMode>();
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [warning, setWarning] = useState<AgentWarning>();
  const [notice, setNotice] = useState('');
  const [tool, setTool] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const ready = status === 'ready';

  useEffect(() => {
    const onPageHide = () => slot.current?.run?.stop();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      const run = slot.current?.run;
      slot.current = null;
      run?.stop();
    };
  }, []);

  function start() {
    if (!consent || slot.current || finished) return;
    const current: CallSlot = { settled: false, ended: false };
    slot.current = current;
    const active = () => slot.current === current;
    setNotice('');
    setMode(undefined);
    setMuted(false);
    setMessages([]);
    setWarning(undefined);
    setAudioBlocked(false);
    setTool('');
    const session = begin();
    const run = startHumainCall(session.context, {
      status: (next) => {
        if (!active()) return;
        setStatus(next);
        if (next === 'ready') session.connected();
      },
      mode: (next) => { if (active()) setMode(next); },
      message: (message) => {
        if (!active()) return;
        session.message(message);
        setMessages((previous) => {
          const known = previous.find((item) => item.id === message.id);
          const next = { ...message, text: message.text.slice(0, 2000) };
          if (known) return known.final ? previous : previous.map((item) => item.id === message.id ? next : item);
          return [...previous, next].slice(-12);
        });
      },
      warning: (next) => { if (active()) setWarning(next); },
      error: (message) => { if (active()) setNotice(message); },
      tool: (name) => { if (active()) setTool(name); },
      audioBlocked: () => { if (active()) setAudioBlocked(true); },
      ended: (reason) => {
        session.ended();
        if (!active()) return;
        current.ended = true;
        if (current.settled) slot.current = null;
        setStatus('ended');
        if (reason === 'credits_exhausted') setNotice('انتهت المحادثة بسبب الرصيد.');
        if (reason === 'local_duration' || reason === 'max_duration') setNotice('انتهت مدة المحادثة.');
        if (reason === 'agent_error' || reason === 'platform_error') setNotice('انقطع الاتصال بالمحادثة.');
        if (reason === 'concurrency_limit') setNotice('وصل الحساب للحد المتزامن للمحادثات.');
      },
    });
    current.run = run;
    void run.ready.finally(() => {
      current.settled = true;
      if (active() && current.ended) slot.current = null;
    });
  }

  function useCall(action: (run: Run) => Promise<void> | undefined) {
    const current = slot.current;
    if (current?.run) void action(current.run)?.catch(() => {
      if (slot.current === current && !current.ended) setNotice('تعذّر تنفيذ الإجراء أثناء المحادثة.');
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">محادثة HUMAIN Voice التجريبية</h2>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={status === 'permission' || status === 'connecting' || ready || status === 'ending'} />
        أوافق على إرسال صوت وعبارات اصطناعية فقط إلى خدمة HUMAIN Voice الخارجية. أحفظ الجواب بعد مراجعته وتأكيده هنا.
      </label>
      <p role="status" className="text-sm text-muted">{statusLabels[status]}{ready && mode ? ` · ${modeLabels[mode]}` : ''}</p>
      {warning && ready && <p className="text-sm text-medium">{warning.cause === 'credits' ? 'الرصيد الحالي قرب يخلص.' : warning.cause === 'max_duration' ? 'مدة المحادثة قربت تخلص.' : 'ورد تنبيه من الخدمة.'}</p>}
      {notice && <p role="alert" className="text-sm text-medium">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        {(status === 'idle' || status === 'ended')
          ? <Button onClick={start} disabled={!consent || finished}>ابدأ محادثة HUMAIN</Button>
          : <Button onClick={() => slot.current?.run?.stop()}>أنه المحادثة</Button>}
        {ready && <>
          <Button onClick={() => { slot.current?.run?.mute(!muted); setMuted(!muted); }}>{muted ? 'شغّل الميكروفون' : 'اكتم الميكروفون'}</Button>
          {mode === 'speaking' && <Button onClick={() => useCall((run) => run.interrupt())}>أوقف الرد</Button>}
          {audioBlocked && <Button onClick={() => useCall(async (run) => {
            await run.startAudio();
            if (slot.current?.run === run) setAudioBlocked(false);
          })}>شغّل صوت الرد</Button>}
        </>}
      </div>
      {tool && <p className="text-sm text-muted">آخر أداة: <bdi>{tool}</bdi></p>}
      {messages.length > 0 && <ul aria-label="نص المحادثة" className="flex flex-col gap-1 text-sm text-ink-2">
        {messages.map((message) => <li key={message.id}>{message.role === 'user' ? 'أنت' : 'HUMAIN'} · {message.text}</li>)}
      </ul>}
    </Card>
  );
}
