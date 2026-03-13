import React from 'react';
import SettingsModal from '../components/SettingsModal';

// Standalone settings page (if navigated to directly)
const Settings: React.FC = () => {
  return <SettingsModal open={true} onClose={() => window.history.back()} />;
};

export default Settings;
