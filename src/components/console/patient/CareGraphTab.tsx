import { AlertTriangle, CalendarPlus, Check, CheckCircle2, Circle, FlaskConical, Bandage, Play, Repeat, SlidersHorizontal, Square, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GAP_TYPE_LABEL, OWNER_LABEL, TASK_TYPE_LABEL, entityLabel, shortTaskLabel } from '../../../domain/labels';
import { DEFAULT_GRAPH_METRICS, fitGraphMetrics, layoutCareGraph } from '../../../domain/graphLayout';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { CareTask, Risk, TaskStatus, TaskType } from '../../../domain/types';
import { cn } from '../../../lib/cn';
import { Card, Drawer, InfoTip, SegmentedControl, Tooltip, focusRing } from '../../ui';
import { RiskBadge, StatusBadge } from '../badges';
import { EvidenceItem } from '../evidence';
import type { PatientView } from './types';

function nodeClasses(status: TaskStatus, risk: Risk): string {
  switch (status) {
    case 'VERIFIED':
      return 'border-success/45 bg-success/10 text-success';
    case 'GAP':
    case 'ESCALATED':
      return risk === 'high' ? 'border-high/55 bg-high/15 text-high' : 'border-medium/55 bg-medium/10 text-medium';
    case 'CLOSED':
      return 'border-line bg-surface-1 text-faint';
    default:
      return 'border-line-strong bg-surface-2 text-ink-2';
  }
}

function StatusGlyph({ status }: { status: TaskStatus }) {
  if (status === 'VERIFIED' || status === 'CLOSED') return <Check size={12} aria-hidden="true" className="shrink-0" />;
  if (status === 'GAP' || status === 'ESCALATED') return <AlertTriangle size={12} aria-hidden="true" className="shrink-0" />;
  return <Circle size={10} aria-hidden="true" className="shrink-0" />;
}

/** What the task asks for (used on compact pills and in the legend). */
const ACTION_ICON: Record<TaskType, { icon: LucideIcon; label: string }> = {
  MED_START: { icon: Play, label: 'Start' },
  MED_STOP: { icon: Square, label: 'Stop' },
  MED_CONTINUE: { icon: Repeat, label: 'Continue' },
  MED_DOSE_CHANGE: { icon: SlidersHorizontal, label: 'Dose change' },
  LAB_DONE: { icon: FlaskConical, label: 'Lab' },
  FOLLOWUP_BOOKED: { icon: CalendarPlus, label: 'Booking' },
  FOLLOWUP_ATTENDED: { icon: CheckCircle2, label: 'Visit' },
  WOUND_CHECK: { icon: Bandage, label: 'Wound check' },
};

function ActionGlyph({ type, size = 12 }: { type: TaskType; size?: number }) {
  const Icon = ACTION_ICON[type].icon;
  return <Icon size={size} aria-hidden="true" className="shrink-0" />;
}

const LEGEND: { label: string; className: string; status: TaskStatus }[] = [
  { label: 'Verified', className: nodeClasses('VERIFIED', 'low'), status: 'VERIFIED' },
  { label: 'Gap · high risk', className: nodeClasses('ESCALATED', 'high'), status: 'ESCALATED' },
  { label: 'Gap · medium / low', className: nodeClasses('GAP', 'medium'), status: 'GAP' },
  { label: 'Pending', className: nodeClasses('PENDING', 'low'), status: 'PENDING' },
  { label: 'Closed', className: nodeClasses('CLOSED', 'low'), status: 'CLOSED' },
];

export function CareGraphTab({ view }: { view: PatientView }) {
  const { patient, tasks, statuses, evidence, gaps, today } = view;
  const wide = useMediaQuery('(min-width: 1280px)');
  const [fitChoice, setFitChoice] = useState<'fit' | 'scroll' | undefined>();
  const fit = (fitChoice ?? (wide ? 'fit' : 'scroll')) === 'fit';
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(Math.floor(entry?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const m = useMemo(() => (fit && boxWidth > 0 ? fitGraphMetrics(tasks, boxWidth) : DEFAULT_GRAPH_METRICS), [fit, boxWidth, tasks]);
  const layout = useMemo(() => layoutCareGraph(tasks, m), [tasks, m]);
  const compact = m.dayWidth < 96;
  const [openTask, setOpenTask] = useState<CareTask | undefined>();
  const todayX = today >= 0 && today <= layout.lastDay ? layout.dayCenter(today) : undefined;
  const days = Array.from({ length: layout.lastDay + 1 }, (_, d) => d);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1 text-sm font-semibold">
          Care graph
          <InfoTip term="careGraph" />
        </span>
        <SegmentedControl
          label="Timeline width"
          value={fit ? 'fit' : 'scroll'}
          onChange={setFitChoice}
          options={[
            { value: 'fit', label: 'Fit 14 days' },
            { value: 'scroll', label: 'Scroll' },
          ]}
        />
        <span className="text-xs text-faint">{fit ? 'Day 0–14 at a glance; hover a task for its full name.' : 'Wider columns; scroll sideways inside the graph.'}</span>
      </div>
      <Card padding="none" className="overflow-hidden" data-tour="care-graph">
        <div
          ref={boxRef}
          className={fit ? 'overflow-hidden' : 'overflow-x-auto'}
          tabIndex={0}
          role="region"
          aria-label={fit ? 'Care graph timeline, Day 0 to 14' : 'Care graph timeline, Day 0 to 14 (scrolls sideways)'}
        >
          <div className="relative" style={{ width: layout.width, height: layout.height + 8 }}>
            {/* lanes */}
            {layout.lanes.map((lane, i) => (
              <div
                key={lane.lane}
                className={cn('absolute inset-x-0 border-t border-line', i % 2 === 1 && 'bg-bg/30')}
                style={{ top: lane.y, height: lane.height }}
              >
                <span className="absolute top-3 left-4 text-xs font-medium text-muted">{lane.lane}</span>
              </div>
            ))}

            {/* day header + grid */}
            {days.map((d) => (
              <div key={d} className="absolute top-0 bottom-0 border-l border-line/50" style={{ left: m.laneLabelWidth + d * m.dayWidth }}>
                <span className={cn('absolute top-2 left-2 text-xs whitespace-nowrap tabular-nums', d === today ? 'font-semibold text-ink' : 'text-faint')}>
                  {compact ? `D${d}` : `Day ${d}`}
                </span>
              </div>
            ))}

            {/* dependencies + today line */}
            <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height + 8} aria-hidden="true">
              {layout.edges.map((e) => {
                const midX = (e.x1 + e.x2) / 2;
                return (
                  <path
                    key={`${e.from}->${e.to}`}
                    d={`M ${e.x1} ${e.y1} C ${midX} ${e.y1}, ${midX} ${e.y2}, ${e.x2} ${e.y2}`}
                    fill="none"
                    stroke="var(--color-line-strong)"
                    strokeWidth={1}
                  />
                );
              })}
              {todayX !== undefined && (
                <g>
                  <line x1={todayX} x2={todayX} y1={m.headerHeight - 6} y2={layout.height + 8} stroke="var(--color-accent)" strokeDasharray="4 4" strokeWidth={1.5} />
                </g>
              )}
            </svg>
            {todayX !== undefined && !compact && (
              <span
                className="absolute rounded bg-accent px-1.5 text-[10px] leading-4 font-semibold text-bg"
                style={{ left: todayX + 4, top: m.headerHeight - 14 }}
              >
                Today
              </span>
            )}

            {/* task nodes */}
            {layout.nodes.map((n) => {
              const status = statuses[n.task.id] ?? 'PENDING';
              return (
                <div key={n.task.id} className="absolute" style={{ left: n.x, top: n.y, width: n.width }}>
                  <Tooltip
                    side="bottom"
                    content={
                      <span>
                        {n.task.label} · Day {n.task.deadlineDay} · {status.toLowerCase()}
                      </span>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setOpenTask(n.task)}
                      aria-label={`${n.task.label}, due Day ${n.task.deadlineDay}, ${status.toLowerCase()}`}
                      className={cn(
                        'flex w-full border text-left font-medium',
                        compact ? 'flex-col justify-center gap-0.5 rounded-lg px-1.5 text-[10px] leading-none' : 'items-center gap-1 rounded-full px-2 text-xs',
                        'transition-[filter,transform] duration-150 ease-out hover:brightness-125 active:scale-[0.98] motion-reduce:active:scale-100',
                        focusRing,
                        nodeClasses(status, n.task.risk),
                      )}
                      style={{ width: n.width, height: n.height }}
                    >
                      {compact ? <ActionGlyph type={n.task.type} size={11} /> : <StatusGlyph status={status} />}
                      <span className={cn('max-w-full truncate', compact && 'pb-px', status === 'CLOSED' && 'line-through decoration-faint')}>
                        {compact ? entityLabel(n.task, patient) : shortTaskLabel(n.task, patient)}
                      </span>
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {LEGEND.map((l) => (
          <span key={l.label} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', l.className)}>
            <StatusGlyph status={l.status} />
            {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-0 border-l-2 border-dashed border-accent" />
          Today (Day {today})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-px w-5 bg-line-strong" />
          Depends on
        </span>
        <span className="ms-auto text-faint">Click a task for details and evidence.</span>
      </div>
      {compact && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Task icons">
          {(Object.keys(ACTION_ICON) as TaskType[])
            .filter((t) => tasks.some((x) => x.type === t))
            .map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <ActionGlyph type={t} />
                {ACTION_ICON[t].label}
              </span>
            ))}
        </div>
      )}

      <Drawer
        open={!!openTask}
        onClose={() => setOpenTask(undefined)}
        title={openTask?.label ?? ''}
        subtitle={openTask ? <span dir="rtl" lang="ar" className="font-arabic">{openTask.labelAr}</span> : undefined}
      >
        {openTask && (
          <div className="flex flex-col gap-5 text-sm">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted">Type</dt>
              <dd>{TASK_TYPE_LABEL[openTask.type]}</dd>
              <dt className="text-muted">Owner</dt>
              <dd>{OWNER_LABEL[openTask.owner]}</dd>
              <dt className="text-muted">Deadline</dt>
              <dd className="tabular-nums">Day {openTask.deadlineDay}</dd>
              <dt className="text-muted">Risk</dt>
              <dd>
                <RiskBadge risk={openTask.risk} />
              </dd>
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusBadge status={statuses[openTask.id] ?? 'PENDING'} risk={openTask.risk} />
              </dd>
              {openTask.dependsOn.length > 0 && (
                <>
                  <dt className="text-muted">Depends on</dt>
                  <dd className="flex flex-col gap-0.5">
                    {openTask.dependsOn.map((id) => (
                      <span key={id} className="text-ink-2">
                        {tasks.find((t) => t.id === id)?.label ?? id}
                      </span>
                    ))}
                  </dd>
                </>
              )}
            </dl>

            {gaps.some((g) => g.taskId === openTask.id) && (
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted">Open gaps</h3>
                <ul className="flex flex-col gap-1">
                  {gaps
                    .filter((g) => g.taskId === openTask.id)
                    .map((g) => (
                      <li key={g.id} className="flex items-center gap-2">
                        <RiskBadge risk={g.risk} />
                        {GAP_TYPE_LABEL[g.type]}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-xs font-medium text-muted">Evidence (provenance)</h3>
              {evidence.filter((e) => e.taskId === openTask.id).length === 0 ? (
                <p className="text-muted">No evidence for this task yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {evidence
                    .filter((e) => e.taskId === openTask.id)
                    .slice()
                    .reverse()
                    .map((e) => (
                      <EvidenceItem key={e.id} evidence={e} />
                    ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
