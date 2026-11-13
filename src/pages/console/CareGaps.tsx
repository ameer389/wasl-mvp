import { BellRing, ChevronDown, ChevronRight, FilePlus2, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RiskBadge, TransferChip } from '../../components/console/badges';
import { Button, EmptyState, InfoTip, Kbd, SegmentedControl, StatCard, buttonClasses, compactControlClasses, focusRing } from '../../components/ui';
import { GAP_TYPE_LABEL, ROUTE_LABEL, gapSubject, readableReason } from '../../domain/labels';
import { addSummaries, daysOpen, questionSavings, verificationSummary } from '../../domain/metrics';
import { DEFAULT_FILTERS, buildQueueRows, filterGaps, isDefaultFilters, type QueueFilters, type QueueRow } from '../../domain/queue';
import type { Gap, GapType, Patient } from '../../domain/types';
import { useHotkey } from '../../hooks/useHotkey';
import { cn } from '../../lib/cn';
import { ROUTES, gapLink } from '../../routes';
import { clinicianGaps, escalationsNow, patientReminders } from '../../state/selectors';
import { useDemoStore } from '../../state/store';

const GRID = 'grid grid-cols-[84px_minmax(180px,240px)_minmax(0,1fr)_48px_80px_52px] items-center gap-4';

function RouteText({ route }: { route: Gap['route'] }) {
  return (
    <span className={cn('text-xs whitespace-nowrap', route === 'CLINICIAN_NOW' ? 'font-semibold text-ink' : 'text-muted')}>
      {ROUTE_LABEL[route]}
    </span>
  );
}

function PatientCell({ patient, day }: { patient: Patient | undefined; day: number }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-ink">{patient?.nameEn ?? 'Unknown'}</div>
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-faint tabular-nums">
        <span className="truncate">Day {day} after discharge</span>
        {patient && <TransferChip patient={patient} />}
      </div>
    </div>
  );
}

export default function CareGaps() {
  const store = useDemoStore();
  const { state, evaluation, tasksByPatient, questionPlans, patientToday } = store;
  const navigate = useNavigate();
  const patients = state.patients;
  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const clinician = clinicianGaps(evaluation.gaps);
  const reminders = patientReminders(evaluation.gaps);
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  const filtered = useMemo(() => filterGaps(clinician, filters, patients), [clinician, filters, patients]);
  const rows = useMemo(() => buildQueueRows(filtered), [filtered]);

  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const current = Math.min(selected, Math.max(0, rows.length - 1));

  const verification = patients.reduce(
    (acc, p) => addSummaries(acc, verificationSummary(tasksByPatient[p.id] ?? [], evaluation.statuses, patientToday(p.id))),
    { verified: 0, due: 0, pct: 0 },
  );
  const savings = questionSavings(Object.values(questionPlans));

  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const openRow = (row: QueueRow) => (row.kind === 'gap' ? navigate(gapLink(row.gap)) : toggle(row.key));

  useHotkey('j', () => setSelected(Math.min(rows.length - 1, current + 1)));
  useHotkey('k', () => setSelected(Math.max(0, current - 1)));
  useHotkey('/', () => searchRef.current?.focus());
  useHotkey('Enter', () => {
    // Only when nothing else (a filter, a button) has focus — otherwise let Enter do its normal job.
    const active = document.activeElement;
    if (active && active !== document.body && !listRef.current?.contains(active)) return false;
    const row = rows[current];
    if (!row) return false;
    openRow(row);
  });

  useEffect(() => {
    const row = rows[current];
    if (row) rowRefs.current.get(row.key)?.scrollIntoView({ block: 'nearest' });
  }, [current, rows]);

  const setFilter = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setSelected(0);
  };

  const rowClass = (i: number) =>
    cn(
      GRID,
      'w-full px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-surface-2',
      focusRing,
      'focus-visible:ring-inset focus-visible:ring-offset-0',
      i === current && 'bg-surface-2 shadow-[inset_2px_0_0_var(--color-accent)]',
    );

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Summary" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Open gaps" value={clinician.length} hint={`+ ${reminders.length} handled as patient reminders`} simulated />
        <StatCard label="High risk now" value={escalationsNow(evaluation.gaps).length} hint="Routed to a clinician now" simulated />
        <StatCard
          label="Tasks verified"
          value={`${verification.verified} of ${verification.due}`}
          hint={`${verification.pct}% of tasks due so far`}
          simulated
        />
        <StatCard
          label="Questions asked today"
          value={`${savings.adaptive} vs ${savings.baseline}`}
          hint={`−${savings.reductionPct}% vs the full phone script`}
          simulated
        />
      </section>

      <section aria-labelledby="queue-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="queue-title" className="flex items-center gap-1 text-sm font-semibold">
            Care gaps to review
            <InfoTip term="gap" />
          </h2>
          <span className="text-xs text-muted tabular-nums" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? 'gap' : 'gaps'}
          </span>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={14} aria-hidden="true" className="text-faint" />
            <SegmentedControl
              label="Risk"
              value={filters.risk}
              onChange={(v) => setFilter('risk', v)}
              options={[
                { value: 'all', label: 'All risk' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
              ]}
            />
            <SegmentedControl
              label="Route"
              value={filters.route}
              onChange={(v) => setFilter('route', v)}
              options={[
                { value: 'all', label: 'All routes' },
                { value: 'now', label: 'Now' },
                { value: '24h', label: '24h' },
              ]}
            />
            <select
              aria-label="Gap type"
              value={filters.type}
              onChange={(e) => setFilter('type', e.target.value as QueueFilters['type'])}
              className={cn(compactControlClasses, 'w-48 pe-8')}
            >
              <option value="all">All types</option>
              {(Object.keys(GAP_TYPE_LABEL) as GapType[]).map((t) => (
                <option key={t} value={t}>
                  {GAP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                type="search"
                aria-label="Search patients"
                placeholder="Search patient"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), setFilter('search', ''))}
                className={cn(compactControlClasses, 'w-44 ps-8')}
              />
            </div>
          </div>
        </div>

        {clinician.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No open gaps"
            text="Gaps appear here when expected care and what happened at home don't match. Each one shows the expected task, the evidence and the rule that fired."
            action={
              <Link to={ROUTES.newDischarge} className={buttonClasses({ variant: 'primary', size: 'sm' })}>
                <FilePlus2 size={14} aria-hidden="true" />
                New discharge
              </Link>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No gaps match these filters"
            text="Try a different risk, route or type, or clear the search."
            action={
              <Button size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-card">
            <div className={cn(GRID, 'border-b border-line px-4 py-2 text-xs font-medium text-faint')}>
              <span>Risk</span>
              <span>Patient</span>
              <span>What is different from the plan</span>
              <span>Open</span>
              <span className="inline-flex items-center gap-1">
                Act
                <InfoTip term="route" align="end" />
              </span>
              <span className="text-right">Priority</span>
            </div>
            <ul ref={listRef} aria-label="Care gaps, highest priority first" className="divide-y divide-line">
              {rows.map((row, i) => {
                const patient = byId.get(row.kind === 'gap' ? row.gap.patientId : row.patientId);
                const today = patient ? patientToday(patient.id) : 0;
                const tasks = patient ? (tasksByPatient[patient.id] ?? []) : [];
                const register = (el: HTMLElement | null) => {
                  if (el) rowRefs.current.set(row.key, el);
                  else rowRefs.current.delete(row.key);
                };

                if (row.kind === 'gap') {
                  const { gap } = row;
                  return (
                    <li key={row.key} data-tour={i === 0 ? 'queue-top' : undefined}>
                      <Link ref={register} to={gapLink(gap)} onFocus={() => setSelected(i)} className={rowClass(i)}>
                        <RiskBadge risk={gap.risk} />
                        <PatientCell patient={patient} day={today} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="shrink-0 text-sm font-medium text-ink">{GAP_TYPE_LABEL[gap.type]}</span>
                            <span className="truncate text-sm text-muted">{patient ? gapSubject(gap, tasks, patient) : ''}</span>
                          </div>
                          <p className="truncate text-xs text-faint" title={gap.reasons[0]}>
                            {readableReason(gap.reasons[0] ?? '')}
                          </p>
                        </div>
                        <span className="text-xs text-muted tabular-nums">{daysOpen(gap, today)}d</span>
                        <RouteText route={gap.route} />
                        <span className="text-right text-xs text-faint tabular-nums">{gap.priority.toFixed(1)}</span>
                      </Link>
                    </li>
                  );
                }

                const open = expanded.has(row.key);
                return (
                  <li key={row.key}>
                    <button
                      ref={register}
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(row.key)}
                      onFocus={() => setSelected(i)}
                      className={rowClass(i)}
                    >
                      <RiskBadge risk={row.risk} />
                      <PatientCell patient={patient} day={today} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                          <span className="shrink-0 text-sm font-medium text-ink">
                            No response · {row.gaps.length} tasks
                          </span>
                          <span className="truncate text-sm text-muted">
                            {patient ? row.gaps.map((g) => gapSubject(g, tasks, patient)).join(', ') : ''}
                          </span>
                        </div>
                        <p className="truncate text-xs text-faint">No answer and no feed data for these tasks.</p>
                      </div>
                      <span className="text-xs text-muted tabular-nums">{Math.max(0, today - row.detectedDay)}d</span>
                      <RouteText route={row.route} />
                      <span className="text-right text-xs text-faint tabular-nums">{row.priority.toFixed(1)}</span>
                    </button>
                    {open && (
                      <ul className="border-t border-line bg-bg/40">
                        {row.gaps.map((g) => (
                          <li key={g.id}>
                            <Link to={gapLink(g)} className={cn(GRID, 'px-4 py-2 text-sm hover:bg-surface-2', focusRing, 'focus-visible:ring-inset')}>
                              <span />
                              <span />
                              <span className="min-w-0 truncate text-ink-2">{patient ? gapSubject(g, tasks, patient) : g.id}</span>
                              <span className="text-xs text-muted tabular-nums">{daysOpen(g, today)}d</span>
                              <RouteText route={g.route} />
                              <span className="text-right text-xs text-faint tabular-nums">{g.priority.toFixed(1)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
          <span>
            <Kbd>j</Kbd> / <Kbd>k</Kbd> move
          </span>
          <span>
            <Kbd>Enter</Kbd> open
          </span>
          <span>
            <Kbd>/</Kbd> search
          </span>
          <span>
            <Kbd>[</Kbd> / <Kbd>]</Kbd> simulated day
          </span>
          {!isDefaultFilters(filters) && (
            <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className={cn('ms-auto rounded text-muted hover:text-ink', focusRing)}>
              Clear filters
            </button>
          )}
        </p>
      </section>

      <details className="group rounded-xl border border-line bg-surface-1">
        <summary className={cn('flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm', focusRing)}>
          <ChevronRight size={14} aria-hidden="true" className="text-muted transition-transform duration-150 group-open:rotate-90" />
          <BellRing size={14} aria-hidden="true" className="text-muted" />
          <span className="font-medium">Patient reminders</span>
          <span className="text-muted tabular-nums">({reminders.length})</span>
          <span className="ms-auto text-xs text-faint">Low-risk items routed to the patient app — no clinician action needed</span>
        </summary>
        {reminders.length === 0 ? (
          <p className="border-t border-line px-4 py-3 text-sm text-muted">No reminders today.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {reminders.map((g) => {
              const patient = byId.get(g.patientId);
              return (
                <li key={g.id} className="flex items-center gap-4 px-4 py-2 text-sm">
                  <span className="w-40 truncate text-ink-2">{patient?.nameEn}</span>
                  <span className="text-muted">{GAP_TYPE_LABEL[g.type]}</span>
                  <span className="min-w-0 truncate text-faint">{patient ? gapSubject(g, tasksByPatient[g.patientId] ?? [], patient) : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </div>
  );
}
