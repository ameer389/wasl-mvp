/**
 * Thin wrapper around the Web Speech API (webkitSpeechRecognition / SpeechRecognition).
 * ar-SA, interim results, up to 3 alternatives, one utterance per start().
 * Chrome/Edge send audio to the browser vendor's speech service: needs a network
 * connection and a secure origin (https or localhost).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceError } from '../domain/checkin';
import { recognitionConfidence, type SpeechAlternative } from '../domain/speechAnswer';

// Minimal typings (the API is not in every TS DOM lib).
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechResult };
}
interface SpeechErrorEvent {
  error: string;
}
interface Recognizer {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognizerCtor = new () => Recognizer;

function getCtor(): RecognizerCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechSupported(): boolean {
  return !!getCtor();
}

const ERROR_MAP: Record<string, VoiceError> = {
  'not-allowed': 'permission_denied',
  'service-not-allowed': 'permission_denied',
  'no-speech': 'no_speech',
  network: 'network',
  'audio-capture': 'audio_capture',
};

interface Callbacks {
  onInterim: (text: string) => void;
  onFinal: (alternatives: SpeechAlternative[]) => void;
  onError: (error: VoiceError) => void;
}

export function useSpeechRecognition(callbacks: Callbacks, lang = 'ar-SA') {
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });
  const rec = useRef<Recognizer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const supported = speechSupported();

  const dispose = useCallback((abort: boolean) => {
    clearTimeout(timer.current);
    const active = rec.current;
    rec.current = null;
    if (!active) return;
    active.onend = active.onerror = active.onresult = null;
    if (abort) {
      try { active.abort(); } catch { /* Already stopped. */ }
    }
  }, []);

  const cancel = useCallback(() => {
    dispose(true);
    setListening(false);
  }, [dispose]);

  const stop = useCallback(() => {
    const active = rec.current;
    if (!active) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (rec.current !== active) return;
      cancel();
      cb.current.onError('no_speech');
    }, 3000);
    try { active.stop(); } catch {
      cancel();
      cb.current.onError('unknown');
    }
  }, [cancel]);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      cb.current.onError('unsupported');
      return;
    }
    dispose(true);
    let r: Recognizer;
    try { r = new Ctor(); } catch {
      setListening(false);
      cb.current.onError('unknown');
      return;
    }
    r.lang = lang;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;
    const finish = (error?: VoiceError, alternatives?: SpeechAlternative[]) => {
      if (rec.current !== r) return;
      dispose(true);
      setListening(false);
      if (error) cb.current.onError(error);
      else if (alternatives?.length) cb.current.onFinal(alternatives);
    };

    r.onresult = (e) => {
      if (rec.current !== r) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        if (res.isFinal) {
          const alts: SpeechAlternative[] = [];
          for (let k = 0; k < res.length; k++) {
            const a = res[k];
            if (a?.transcript.trim()) alts.push({ transcript: a.transcript, confidence: recognitionConfidence(a.confidence) });
          }
          finish(alts.length ? undefined : 'no_speech', alts);
          return;
        } else {
          interim += res[0]?.transcript ?? '';
        }
      }
      if (interim) cb.current.onInterim(interim);
    };
    r.onerror = (e) => {
      finish(ERROR_MAP[e.error] ?? 'unknown');
    };
    r.onend = () => {
      finish('no_speech');
    };

    rec.current = r;
    setListening(true);
    timer.current = setTimeout(() => finish('no_speech'), 20000);
    try {
      r.start();
    } catch {
      finish('unknown');
    }
  }, [dispose, lang]);

  useEffect(() => () => dispose(true), [dispose]);

  return { supported, listening, start, stop, cancel };
}
