import React from 'react';
import Sidebar, { Route } from './Sidebar';

const PAGE_TITLES: Record<Route, string> = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  'device-detail': 'Device Detail',
  sessions: 'Sessions',
  jobs: 'Jobs',
  categories: 'Categories',
  'pincode-details': 'Pincode Details',
  'scraped-pincodes': 'Scraped Pincodes',
  'scrap-database': 'Scrap Database',
  duplicates: 'Duplicates',
  'website-scraper': 'Website Scraper',
  'coming-pincodes': 'Coming Pincodes',
  'ssh-terminal': 'SSH Terminal',
};

interface LayoutProps {
  currentRoute: Route;
  onNavigate: (route: Route) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ currentRoute, onNavigate, onLogout, children }) => {
  const [time, setTime] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }} className="bg-slate-950 text-white">
      <Sidebar currentRoute={currentRoute} onNavigate={onNavigate} onLogout={onLogout} />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 text-xs">BetaZen</span>
            <svg className="w-3 h-3 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-white font-medium text-sm">{PAGE_TITLES[currentRoute]}</span>
          </div>
          <div className="ml-auto font-mono text-xs text-slate-500 tabular-nums">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0">
          <div className="max-w-[1400px] mx-auto w-full flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
