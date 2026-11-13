import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted sm:px-6">
        Synthetic data only · Not a medical device · WASL never prescribes, doses or diagnoses — it surfaces
        care gaps and routes them to a clinician.
      </footer>
    </div>
  );
}
