import { Link, NavLink } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '../config';
import { DEMO_PATIENT_ID, ROUTES, patientCheckinPath } from '../routes';
import DemoBadge from './DemoBadge';
import SimulatedDayControl from './SimulatedDayControl';

const NAV_ITEMS = [
  { to: ROUTES.clinicianQueue, label: 'Clinician', end: true },
  { to: ROUTES.clinicianNew, label: 'New plan', end: true },
  { to: patientCheckinPath(DEMO_PATIENT_ID), label: 'Patient app', end: false },
  { to: ROUTES.validation, label: 'Validation', end: true },
  { to: ROUTES.about, label: 'How it works', end: true },
] as const;

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur" dir="ltr" lang="en">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link to={ROUTES.landing} className="flex items-baseline gap-2" aria-label={`${APP_NAME} home`}>
          <span className="text-xl font-extrabold tracking-[0.2em] text-accent">{APP_NAME}</span>
          <span className="hidden text-sm text-muted sm:inline">{APP_TAGLINE}</span>
        </Link>

        <nav aria-label="Main" className="order-3 w-full overflow-x-auto md:order-none md:w-auto md:flex-1">
          <ul className="flex gap-1 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
                      isActive ? 'bg-panel text-accent' : 'text-muted hover:text-ink'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SimulatedDayControl />
          <DemoBadge />
        </div>
      </div>
    </header>
  );
}
