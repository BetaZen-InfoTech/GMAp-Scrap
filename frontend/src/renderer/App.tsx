import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import PopupSession from './pages/PopupSession';
import Register from './pages/Register';
import PasscodeScreen from './components/PasscodeScreen';

type AppScreen = 'loading' | 'passcode' | 'verifying' | 'register' | 'dashboard' | 'popup';

function getPopupSessionId(): string | null {
  const hash = window.location.hash.replace('#', '') || window.location.pathname;
  if (hash.startsWith('/popup/')) {
    const id = hash.replace('/popup/', '');
    return id || null;
  }
  return null;
}

const Spinner: React.FC<{ message?: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3">
    <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    {message && <p className="text-sm text-slate-400">{message}</p>}
  </div>
);

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [popupSessionId] = useState<string | null>(getPopupSessionId);
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    // Popup windows skip all checks
    if (popupSessionId) {
      setScreen('popup');
      return;
    }

    // Step 1: Load settings, check passcode, then verify registration
    window.electronAPI.getSettings().then((settings) => {
      if (settings.passcode) {
        // Passcode is set — show lock screen first
        setScreen('passcode');
      } else {
        // No passcode — proceed to verification
        verifyRegistration(settings.isRegistered);
      }
    });
  }, [popupSessionId]);

  /** Step 2: Check local flag + verify against database */
  const verifyRegistration = async (isRegistered: boolean) => {
    if (!isRegistered) {
      setScreen('register');
      return;
    }

    // Local flag says registered — verify with database
    setScreen('verifying');
    setVerifyError('');

    try {
      const result = await window.electronAPI.verifyDevice();
      if (result.success) {
        setScreen('dashboard');
      } else {
        // Device not found or deactivated in database
        setVerifyError(result.error ?? 'Device verification failed');
        setScreen('register');
      }
    } catch {
      // Network error — still allow access since local flag is set
      // (offline tolerance: trust local registration if DB is unreachable)
      setScreen('dashboard');
    }
  };

  /** Called after passcode is correct */
  const handlePasscodeUnlocked = () => {
    window.electronAPI.getSettings().then((settings) => {
      verifyRegistration(settings.isRegistered);
    });
  };

  /** Called after successful registration */
  const handleRegistered = () => {
    setScreen('dashboard');
  };

  if (screen === 'loading') return <Spinner />;
  if (screen === 'verifying') return <Spinner message="Verifying device..." />;
  if (screen === 'passcode') return <PasscodeScreen onUnlocked={handlePasscodeUnlocked} />;
  if (screen === 'register') return <Register onRegistered={handleRegistered} verifyError={verifyError} />;
  if (screen === 'popup' && popupSessionId) return <PopupSession sessionId={popupSessionId} />;
  return <Dashboard />;
};

export default App;
