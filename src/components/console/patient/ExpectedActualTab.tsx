import { Fragment } from 'react';
import { getDrug } from '../../../domain/drugs';
import { evidenceClaimLabel, OWNER_LABEL } from '../../../domain/labels';
import { LANES, laneOf } from '../../../domain/graphLayout';
import { VERIFY_THRESHOLD, type EvidenceAssessment } from '../../../domain/medicationEvidence';
import type { CareTask, Evidence } from '../../../domain/types';
import { cn } from '../../../lib/cn';
import { InfoTip } from '../../ui';
import { StatusBadge } from '../badges';
import { ArabicQuote, SourceIcon } from '../evidence';
import type { PatientView } from './types';

const HAS_GAP = new Set(['GAP', 'ESCALATED']);

function Actual({ e }: { e: Evidence | undefined }) {
  if (!e) return <span className="text-xs text-faint">No evidence yet</span>;
  const low = e.confidence < VERIFY_THRESHOLD || e.claim === 'UNSURE';
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
        <SourceIcon source={e.source} size={13} className="text-muted" />
        <span className="text-muted tabular-nums">Day {e.day}</span>
        {e.recordedDay !== undefined && e.recordedDay !== e.day && <span className="text-muted">Recorded Day {e.recordedDay}</span>}
        <span className="font-medium text-ink-2">{evidenceClaimLabel(e)}</span>
        <span className={cn('tabular-nums', low ? 'text-medium' : 'text-muted')}>{Math.round(e.confidence * 100)}%</span>
        {e.source === 'clinician' && e.confirmedByHuman && <span className="text-muted">Reviewed by clinician</span>}
      </span>
      {e.rawText ? <ArabicQuote text={e.rawText} className="truncate text-sm" /> : e.detail ? <span className="truncate text-xs text-faint">{e.detail}</span> : null}
    </div>
  );
}

function EffectiveActual({ assessment, superseded }: { assessment: EvidenceAssessment; superseded: ReadonlySet<string> }) {
  const { effective, uncertainty, latest, contradiction, history } = assessment;
  const additional = [uncertainty, latest, contradiction, ...[...history].reverse()]
    .filter((e): e is Evidence => !!e && e !== effective);
  const distinct = [...new Map(additional.map((e) => [e.id, e])).values()];
  return (
    <>
      {effective ? <Actual e={effective} /> : <span className="text-xs text-faint">No eligible outcome established</span>}
      {uncertainty && <span className="block text-xs text-medium">A later or unresolved report needs review</span>}
      {history.length > 0 && distinct.length > 0 && (
        <details className="mt-1 space-y-2 text-xs text-muted">
          <summary className="cursor-pointer">Evidence history{contradiction ? ' · contradictory report' : ''}</summary>
          {distinct.map((e) => (
            <div key={e.id}>
              {superseded.has(e.id) && <span className="text-faint">Earlier report corrected</span>}
              {e === uncertainty && <span className="text-medium">Unresolved report</span>}
              {e === contradiction && <span className="text-faint">Conflicts with effective report</span>}
              <Actual e={e} />
            </div>
          ))}
        </details>
      )}
    </>
  );
}

export function ExpectedActualTab({ view }: { view: PatientView }) {
  const { patient, tasks, statuses, assessments, gaps, medication } = view;
  const openReports = [...medication.open].filter(([, entry]) =>
    !patient.plan.meds.some((m) => m.drugId === entry.latest?.drugId && m.action === 'STOP'));
  const sortTasks = (a: CareTask, b: CareTask) =>
    Number(HAS_GAP.has(statuses[b.id] ?? '')) - Number(HAS_GAP.has(statuses[a.id] ?? '')) || a.deadlineDay - b.deadlineDay;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <caption className="sr-only">Expected versus actual, one row per task, gaps first within each lane</caption>
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[16%]" />
            <col className="w-[40%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="border-b border-line text-left text-xs text-faint">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Task
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Expected
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Actual (effective evidence)
                  <InfoTip term="confidence" />
                </span>
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {openReports.length > 0 && (
              <>
                <tr className="border-t border-line bg-bg/40">
                  <th scope="rowgroup" colSpan={4} className="px-4 py-1.5 text-left text-xs font-semibold text-muted">
                    Open medication reports
                  </th>
                </tr>
                {openReports.map(([key, entry]) => {
                  const e = entry.effective ?? entry.latest;
                  if (!e) return null;
                  const inPlan = patient.plan.meds.find((m) => m.drugId === e.drugId);
                  const gap = gaps.find((g) => entry.history.some((item) => g.evidenceIds.includes(item.id)));
                  return (
                    <tr key={key} className={cn('border-t border-line align-top', gap && 'bg-surface-2/40')}>
                      <td className="px-4 py-3">
                        <span className="text-ink">{e.drugId ? (getDrug(e.drugId)?.generic ?? e.drugId) : (e.detail ?? 'Unidentified medicine')}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-2">
                        {inPlan ? <div>{inPlan.action} · {inPlan.dose} {inPlan.frequency}</div> : <div>{e.drugId ? 'Not listed in plan' : 'Identity unconfirmed'}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <EffectiveActual assessment={entry} superseded={medication.superseded} />
                      </td>
                      <td className="px-4 py-3">
                        {gap
                          ? <StatusBadge status={gap.route === 'CLINICIAN_NOW' ? 'ESCALATED' : 'GAP'} risk={gap.risk} />
                          : <span className="text-xs text-muted">No open flag</span>}
                      </td>
                    </tr>
                  );
                })}
              </>
            )}
            {LANES.map((lane) => {
              const rows = tasks.filter((t) => laneOf(t.type) === lane).sort(sortTasks);
              if (rows.length === 0) return null;
              return (
                <Fragment key={lane}>
                  <tr className="border-t border-line bg-bg/40">
                    <th scope="rowgroup" colSpan={4} className="px-4 py-1.5 text-left text-xs font-semibold text-muted">
                      {lane}
                    </th>
                  </tr>
                  {rows.map((t) => {
                    const status = statuses[t.id] ?? 'PENDING';
                    const assessment = assessments.get(t.id);
                    return (
                      <tr key={t.id} className={cn('border-t border-line align-top', HAS_GAP.has(status) && 'bg-surface-2/40')}>
                        <td className="px-4 py-3">
                          <span className="text-ink">{t.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-2">
                          <div className="tabular-nums">By Day {t.deadlineDay}</div>
                          <div className="text-muted">{OWNER_LABEL[t.owner]}</div>
                        </td>
                        <td className="px-4 py-3">
                          {assessment ? <EffectiveActual assessment={assessment} superseded={medication.superseded} /> : <Actual e={undefined} />}
                        </td>
                        <td className="px-4 py-3">
                          {assessment && status === 'CLOSED'
                            ? <span className="text-xs text-muted">Gap closed</span>
                            : <StatusBadge status={status} risk={t.risk} />}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
