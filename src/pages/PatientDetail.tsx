import { useParams } from 'react-router-dom';
import PagePlaceholder from '../components/PagePlaceholder';

export default function PatientDetail() {
  const { id = '' } = useParams<{ id: string }>();
  return (
    <PagePlaceholder
      title={`Patient detail · ${id}`}
      description="Care graph, expected vs actual for each task, gap evidence and the audit trail for one patient."
      note="Placeholder · built in Phase 4"
    />
  );
}
