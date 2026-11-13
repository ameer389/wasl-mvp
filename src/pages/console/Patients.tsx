import { FilePlus2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, buttonClasses } from '../../components/ui';
import { ROUTES } from '../../routes';

export default function Patients() {
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
