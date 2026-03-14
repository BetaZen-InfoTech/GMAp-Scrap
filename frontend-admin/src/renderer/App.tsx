import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useSocket } from './hooks/useSocket';
import { getBaseUrl, setUnauthorizedHandler, initBaseUrl } from './lib/api';
import type { Route } from './components/Sidebar';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import SessionsPage from './pages/SessionsPage';
import CategoriesPage from './pages/CategoriesPage';
import PincodeDetailsPage from './pages/PincodeDetailsPage';
import ScrapedPincodesPage from './pages/ScrapedPincodesPage';
import ScrapDatabasePage from './pages/ScrapDatabasePage';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const { isAuthenticated, restoreSession, clearSession, logout } = useAuthStore();
  const [route, setRoute] = useState<Route>('dashboard');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [initializing, setInitializing] = useState(true);

  // Connect WebSocket when authenticated
  useSocket(isAuthenticated ? getBaseUrl() : '');

  // Register 401 handler — auto-logout on any unauthorized response
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
  }, []);

  // Initialize API base URL + restore session on mount
  useEffect(() => {
    if (typeof window.electronAPI?.getSettings === 'function') {
      initBaseUrl()
        .then(() => restoreSession())
        .catch((err) => console.error('[App] init error:', err))
        .finally(() => { console.log("[App] init done"); setInitializing(false); });
    } else {
      console.warn('[App] window.electronAPI not available');
      setInitializing(false);
    }
  }, []);

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Spinner message="Loading..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const handleNavigate = (newRoute: Route, params?: { deviceId?: string }) => {
    setRoute(newRoute);
    if (params?.deviceId) {
      setSelectedDeviceId(params.deviceId);
    }
  };

  const handleDeviceClick = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setRoute('device-detail');
  };

  const renderPage = () => {
    switch (route) {
      case 'dashboard':
        return <DashboardPage />;
      case 'devices':
        return <DevicesPage onDeviceClick={handleDeviceClick} />;
      case 'device-detail':
        return (
          <DeviceDetailPage
            deviceId={selectedDeviceId}
            onBack={() => setRoute('devices')}
          />
        );
      case 'sessions':
        return <SessionsPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'pincode-details':
        return <PincodeDetailsPage />;
      case 'scraped-pincodes':
        return <ScrapedPincodesPage />;
      case 'scrap-database':
        return <ScrapDatabasePage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <Layout currentRoute={route} onNavigate={(r) => handleNavigate(r)} onLogout={logout}>
      {renderPage()}
    </Layout>
  );
};

export default App;
