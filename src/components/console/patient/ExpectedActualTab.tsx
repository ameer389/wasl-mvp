import { Fragment } from 'react';
import { getDrug } from '../../../domain/drugs';
import { CLAIM_LABEL, OWNER_LABEL } from '../../../domain/labels';
import { LANES, laneOf } from '../../../domain/graphLayout';
import type { CareTask, Evidence, TaskStatus } from '../../../domain/types';
import { cn } from '../../../lib/cn';
import { InfoTip } from '../../ui';
import { StatusBadge } from '../badges';
import { ArabicQuote, SourceIcon } from '../evidence';
import type { PatientView } from './types';

const HAS_GAP = new Set(['GAP', 'ESCALATED']);

function Actual({ e }: { e: Evidence | undefined }) {
  if (!e) return <span className="text-xs text-faint">No evidence yet</span>;
  const low = e.confidence < 0.7;
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
        <SourceIcon source={e.source} size={13} className="text-muted" />
        <span className="text-muted tabular-nums">Day {e.day}</span>
        <span className="font-medium text-ink-2">{CLAIM_LABEL[e.claim]}</span>
        <span className={cn('tabular-nums', low ? 'text-medium' : 'text-muted')}>{Math.round(e.confidence * 100)}%</span>
      </span>
      {e.rawText ? <ArabicQuote text={e.rawText} className="truncate text-sm" /> : e.detail ? <span className="truncate text-xs text-faint">{e.detail}</span> : null}
    </div>
  );
}

export function ExpectedActualTab({ view }: { view: PatientView }) {
  const { patient, tasks, statuses, evidence, gaps } = view;
  const planDrugs = new Set(patient.plan.meds.map((m) => m.drugId));
  // Medicines reported in use that are not in the discharge plan at all (one row per medicine).
  const unlisted = [
    ...new Map(
      evidence
        .filter((e) => e.claim === 'TAKING_UNLISTED' && !(e.drugId && planDrugs.has(e.drugId)))
        .map((e) => [e.drugId ?? e.id, e] as const),
    ).values(),
  ];
  const unlistedStatus = (e: Evidence): { status: TaskStatus; risk: 'high' | 'medium' } => {
    const gap = gaps.find((g) => (e.drugId ? g.drugId === e.drugId : g.evidenceIds.includes(e.id)));
    if (!gap) return { status: 'CLOSED', risk: 'medium' };
    return { status: gap.route === 'CLINICIAN_NOW' ? 'ESCALATED' : 'GAP', risk: gap.risk === 'high' ? 'high' : 'medium' };
  };
  const latest = (task: CareTask) => [...evidence].reverse().find((e) => e.taskId === task.id);
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
                  Actual (latest evidence)
                  <InfoTip term="confidence" />
                </span>
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {unlisted.length > 0 && (
              <>
                <tr className="border-t border-line bg-bg/40">
                  <th scope="rowgroup" colSpan={4} className="px-4 py-1.5 text-left text-xs font-semibold text-muted">
                    Not in the plan (reported at home)
                  </th>
                </tr>
                {unlisted.map((e) => {
                  const { status, risk } = unlistedStatus(e);
                  return (
                    <tr key={e.id} className={cn('border-t border-line align-top', HAS_GAP.has(status) && 'bg-surface-2/40')}>
                      <td className="px-4 py-3">
                        <span className="text-ink">{e.drugId ? (getDrug(e.drugId)?.generic ?? e.drugId) : (e.detail ?? 'Unidentified medicine')}</span>
                        <div className="text-xs text-muted">Not on the discharge list</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-2">
                        <div>Not expected</div>
                        <div className="text-muted">Plan lists {patient.plan.meds.length} medicines</div>
                      </td>
                      <td className="px-4 py-3">
                        <Actual e={e} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} risk={risk} />
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
                          <Actual e={latest(t)} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={status} risk={t.risk} />
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
