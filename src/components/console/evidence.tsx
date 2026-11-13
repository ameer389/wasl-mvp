import { CalendarCheck, Database, Mic, ShieldCheck, Smartphone, Stethoscope, TestTube, Users, type LucideIcon } from 'lucide-react';
import { SOURCE_LABEL } from '../../domain/gapEngine';
import { CLAIM_LABEL } from '../../domain/labels';
import type { Evidence, EvidenceSource } from '../../domain/types';
import { cn } from '../../lib/cn';

const SOURCE_ICON: Record<EvidenceSource, LucideIcon> = {
  patient_voice: Mic,
  patient_app: Smartphone,
  family: Users,
  ehr: Database,
  lab_system: TestTube,
  appointment_system: CalendarCheck,
  clinician: Stethoscope,
};

export function SourceIcon({ source, size = 14, className }: { source: EvidenceSource; size?: number; className?: string }) {
  const Icon = SOURCE_ICON[source];
  return <Icon size={size} aria-label={SOURCE_LABEL[source]} role="img" className={cn('shrink-0', className)} />;
}

/** Patient/family words exactly as received: Arabic, RTL, quoted. */
export function ArabicQuote({ text, className }: { text: string; className?: string }) {
  return (
    <span dir="rtl" lang="ar" className={cn('font-arabic text-ink-2', className)}>
      «{text}»
    </span>
  );
}

const pct = (c: number) => `${Math.round(c * 100)}%`;

/** Compact evidence chip: source icon, day, confidence, raw text. */
export function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const low = evidence.confidence < 0.7;
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-line bg-bg/60 px-2 py-1 text-xs">
      <SourceIcon source={evidence.source} size={13} className="text-muted" />
      <span className="text-muted tabular-nums">Day {evidence.day}</span>
      <span className="text-ink-2">{CLAIM_LABEL[evidence.claim]}</span>
      <span className={cn('tabular-nums', low ? 'text-medium' : 'text-muted')} title="Understanding confidence">
        {pct(evidence.confidence)}
      </span>
      {evidence.confirmedByHuman && <ShieldCheck size={13} aria-label="Confirmed by a person" className="text-success" />}
      {evidence.rawText && <ArabicQuote text={evidence.rawText} className="min-w-0 truncate" />}
    </span>
  );
}

/** Full evidence row with provenance (drawer, right column). */
export function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const low = evidence.confidence < 0.7;
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-bg/40 p-3" title={`Record ${evidence.id}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-muted">
        <SourceIcon source={evidence.source} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-medium text-ink">{SOURCE_LABEL[evidence.source]}</span>
          <span className="text-muted tabular-nums">Day {evidence.day}</span>
          <span className="text-ink-2">{CLAIM_LABEL[evidence.claim]}</span>
          <span className={cn('tabular-nums', low ? 'text-medium' : 'text-muted')}>confidence {pct(evidence.confidence)}</span>
          {evidence.confirmedByHuman && <span className="text-success">confirmed by a person</span>}
        </div>
        {evidence.rawText && <ArabicQuote text={evidence.rawText} className="block text-sm" />}
        {evidence.detail && <p className="text-xs text-muted">{evidence.detail}</p>}
      </div>
    </li>
  );
}
