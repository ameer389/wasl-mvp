import { ArrowDown, ArrowUp, FilePlus2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RISK_VARIANT, TransferChip } from '../../components/console/badges';
import { SourceIcon } from '../../components/console/evidence';
import { Badge, EmptyState, ProgressBar, buttonClasses, focusRing } from '../../components/ui';
import { SOURCE_LABEL } from '../../domain/gapEngine';
import { highestRisk, lastCheckIn, verificationSummary } from '../../domain/metrics';
import { cn } from '../../lib/cn';
import { ROUTES, clinicianPatientPath } from '../../routes';
import { useDemoStore } from '../../state/store';

type SortKey = 'gaps' | 'name';

export default function Patients() {
  const { state, evaluation, tasksByPatient, patientToday } = useDemoStore();
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'gaps', dir: 'desc' });

  const rows = useMemo(() => {
    const list = state.patients.map((p) => {
      const today = patientToday(p.id);
      const gaps = evaluation.gapsByPatient[p.id] ?? [];
      return {
        patient: p,
        today,
        gaps,
        risk: highestRisk(gaps),
        verification: verificationSummary(tasksByPatient[p.id] ?? [], evaluation.statuses, today),
        checkIn: lastCheckIn(state.evidence, p.id, today),
      };
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) =>
      sort.key === 'name'
        ? dir * a.patient.nameEn.localeCompare(b.patient.nameEn)
        : dir * (a.gaps.length - b.gaps.length) || a.patient.nameEn.localeCompare(b.patient.nameEn),
    );
  }, [state.patients, state.evidence, evaluation, tasksByPatient, patientToday, sort]);

  if (state.patients.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No patients being followed"
        text="Patients appear here once their discharge plan is turned into a care graph. WASL follows each patient for the first 14 days at home."
        action={
          <Link to={ROUTES.newDischarge} className={buttonClasses({ variant: 'primary', size: 'sm' })}>
            <FilePlus2 size={14} aria-hidden="true" />
            New discharge
          </Link>
        }
      />
    );
  }

  const sortHeader = (k: SortKey, children: string) => {
    const active = sort.key === k;
    const Icon = sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th key={k} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-3 py-2 font-medium">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : k === 'name' && s.key !== k ? 'asc' : 'desc' }))}
          className={cn('inline-flex items-center gap-1 rounded hover:text-ink', focusRing, active && 'text-ink')}
        >
          {children}
          {active && <Icon size={12} aria-hidden="true" />}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <caption className="sr-only">Discharged patients followed by WASL</caption>
          <thead className="border-b border-line text-left text-xs whitespace-nowrap text-faint">
            <tr>
              {sortHeader('name', 'Patient')}
              <th scope="col" className="px-3 py-2 font-medium">
                Age · sex
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Diagnosis
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Hospital
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Day
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Tasks verified
              </th>
              {sortHeader('gaps', 'Open gaps')}
              <th scope="col" className="px-3 py-2 font-medium">
                Last check-in
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ patient: p, today, gaps, risk, verification, checkIn }) => (
              <tr
                key={p.id}
                onClick={() => navigate(clinicianPatientPath(p.id))}
                className="cursor-pointer transition-colors duration-150 hover:bg-surface-2"
              >
                <td className="px-3 py-3">
                  <Link to={clinicianPatientPath(p.id)} onClick={(e) => e.stopPropagation()} className={cn('rounded font-medium whitespace-nowrap text-ink hover:underline', focusRing)}>
                    {p.nameEn}
                  </Link>
                  <div dir="rtl" lang="ar" className="text-left font-arabic text-xs text-muted">
                    {p.nameAr}
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-ink-2 tabular-nums">
                  {p.age} · {p.sex}
                </td>
                <td className="max-w-56 px-3 py-3">
                  <span className="line-clamp-2 text-ink-2">{p.plan.diagnosisLabel}</span>
                </td>
                <td className="px-3 py-3">
                  <div className="text-ink-2">{p.plan.hospital}</div>
                  {p.transfer && (
                    <div className="mt-1">
                      <TransferChip patient={p} detailed />
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-ink-2 tabular-nums">{today < 0 ? `From Day ${p.dischargeDay}` : `Day ${today}`}</td>
                <td className="w-40 px-3 py-3">
                  <ProgressBar value={verification.verified} max={verification.due} label={`Tasks verified for ${p.nameEn}`} />
                </td>
                <td className="px-3 py-3">
                  <Badge variant={risk ? RISK_VARIANT[risk] : 'neutral'} dot={!!risk} aria-label={`${gaps.length} open gaps`}>
                    {gaps.length}
                  </Badge>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {checkIn ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                      <SourceIcon source={checkIn.source} size={13} className="text-muted" />
                      <span className="tabular-nums">Day {checkIn.day}</span>
                      <span className="text-muted">· {SOURCE_LABEL[checkIn.source]}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-faint">No answers yet</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
