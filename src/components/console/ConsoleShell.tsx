import { Outlet } from 'react-router-dom';
import { ToastProvider } from '../ui';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

/**
 * Care team console (EN, LTR): desktop app shell for long, focused use.
 * Sidebar + top bar are fixed; only the content area scrolls.
 */
export default function ConsoleShell() {
  return (
    <ToastProvider>
      <div lang="en" dir="ltr" className="flex h-dvh overflow-hidden bg-bg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
