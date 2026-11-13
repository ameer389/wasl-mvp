import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import DemoBadge from '../components/DemoBadge';
import { EmptyState, buttonClasses } from '../components/ui';
import { ROUTES } from '../routes';

export default function NotFound() {
  return (
    <div lang="en" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <EmptyState
        icon={Compass}
        title="Page not found"
        text="This page doesn't exist in the WASL demo."
        action={
          <Link to={ROUTES.launcher} className={buttonClasses({ variant: 'primary', size: 'sm' })}>
            Choose an app
          </Link>
        }
      />
      <DemoBadge />
    </div>
  );
}
