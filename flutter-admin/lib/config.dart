// App-level config. Operator can override the base URL at runtime through the
// Settings page; this is just the default we ship with.

class AppConfig {
  static const String appName = 'BetaZen Admin';
  static const String appVersion = '1.8.1';

  // Same URLs as the Electron admin's .env defaults. The runtime base URL is
  // resolved through AuthService (operator can change it from the Settings
  // page), but a sensible default avoids forcing every install to type it in.
  static const String defaultBaseUrl =
      'https://gmap-scrap-backend-api.betazeninfotech.com';

  // Common HTTP request timeouts in milliseconds.
  static const int connectTimeoutMs = 15000;
  static const int receiveTimeoutMs = 30000;

  // How often to auto-refresh data on the main pages while the screen is open.
  static const Duration autoRefreshInterval = Duration(seconds: 30);
}
