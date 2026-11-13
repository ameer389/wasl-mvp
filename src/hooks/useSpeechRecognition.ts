/**
 * Thin wrapper around the Web Speech API (webkitSpeechRecognition / SpeechRecognition).
 * ar-SA, interim results, up to 3 alternatives, one utterance per start().
 * Chrome/Edge send audio to the browser vendor's speech service: needs a network
 * connection and a secure origin (https or localhost).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceError } from '../domain/checkin';

// Minimal typings (the API is not in every TS DOM lib).
interface SpeechAlternative {
  transcript: string;
  confidence: number;
}
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

export interface Alternative {
  transcript: string;
  /** Recogniser confidence 0..1; undefined when the browser reports 0 (unknown). */
  confidence?: number;
}

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
  onFinal: (alternatives: Alternative[]) => void;
  onError: (error: VoiceError) => void;
}

export function useSpeechRecognition(callbacks: Callbacks, lang = 'ar-SA') {
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });
  const rec = useRef<Recognizer | null>(null);
  const [listening, setListening] = useState(false);
  const supported = speechSupported();

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      cb.current.onError('unsupported');
      return;
    }
    rec.current?.abort();
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;
    let finished = false;

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        if (res.isFinal) {
          finished = true;
          const alts: Alternative[] = [];
          for (let k = 0; k < res.length; k++) {
            const a = res[k];
            if (a?.transcript.trim()) alts.push({ transcript: a.transcript, ...(a.confidence > 0 ? { confidence: a.confidence } : {}) });
          }
          cb.current.onFinal(alts);
        } else {
          interim += res[0]?.transcript ?? '';
        }
      }
      if (interim && !finished) cb.current.onInterim(interim);
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      finished = true;
      cb.current.onError(ERROR_MAP[e.error] ?? 'unknown');
    };
    r.onend = () => {
      setListening(false);
      if (!finished) cb.current.onError('no_speech');
    };

    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      cb.current.onError('unknown');
    }
  }, [lang]);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, start, stop };
}
