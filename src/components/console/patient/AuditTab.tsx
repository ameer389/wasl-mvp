import { useMemo, useState } from 'react';
import { patientAuditTrail, type AuditKind } from '../../../domain/auditTrail';
import { detectedGaps } from '../../../state/selectors';
import { useDemoStore } from '../../../state/store';
import { Badge, EmptyState, SegmentedControl } from '../../ui';
import { History } from 'lucide-react';
import type { PatientView } from './types';

const timeOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

export function AuditTab({ view }: { view: PatientView }) {
  const { patient, tasks } = view;
  const { state } = useDemoStore();
  const [filter, setFilter] = useState<'all' | AuditKind>('all');

  const rows = useMemo(
    () =>
      patientAuditTrail({
        patient,
        tasks,
        audit: state.audit,
        detectedGaps: detectedGaps(patient, tasks, state.evidence, state.simulatedDay),
        globalDay: state.simulatedDay,
      }),
    [patient, tasks, state.audit, state.evidence, state.simulatedDay],
  );
  const shown = filter === 'all' ? rows : rows.filter((r) => r.kind === filter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SegmentedControl
          label="Audit filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'clinician', label: 'Clinician' },
            { value: 'system', label: 'System' },
          ]}
        />
        <span className="text-xs text-muted tabular-nums">{shown.length} entries · newest first</span>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={History} title="No entries" text="Clinician actions such as logged calls, confirmations and resolutions appear here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">Audit trail for {patient.nameEn}</caption>
              <thead className="border-b border-line text-left text-xs text-faint">
                <tr>
                  {['Day', 'Time', 'Actor', 'Action', 'Target', 'Note'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.key} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-2 tabular-nums">Day {r.day}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums">{timeOf(r.at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Badge variant={r.kind === 'clinician' ? 'low' : 'neutral'}>{r.kind === 'clinician' ? 'Clinician' : 'System'}</Badge>
                        <span className="text-ink-2">{r.actor}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink">{r.action}</td>
                    <td className="max-w-72 px-4 py-2.5 text-ink-2">{r.target}</td>
                    <td className="max-w-64 px-4 py-2.5 text-xs text-muted">{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
