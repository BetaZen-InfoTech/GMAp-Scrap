# BetaZen Admin (Flutter)

Mobile/web admin client for the BetaZen G-Map Scraper. Talks to the same
`/api/admin/*` endpoints as the Electron `frontend-admin/` — same login, same
data — so an operator can sanity-check the cluster from a phone without
firing up a laptop.

## Status (v1.8.1)

Implemented pages:

| Page      | Backend endpoint(s)               | Notes                                       |
|-----------|-----------------------------------|---------------------------------------------|
| Login     | `POST /api/admin/login`           | Persists token + base URL across launches   |
| Dashboard | `GET  /api/admin/devices`         | Online / offline / flagged tallies          |
| Devices   | `GET  /api/admin/devices`         | Search, online/offline tabs, live CPU/RAM/Disk bars, recent records/sessions |
| Sessions  | `GET  /api/admin/sessions`        | Status, records, dup count, rounds          |
| Jobs      | `GET  /api/admin/jobs`            | Progress bar per job                        |
| Settings  | —                                 | Edit backend URL, sign out                  |

Pages not yet ported (live on the Electron build for now): Scrap Database,
Duplicates, Deleted Records, Website Analysis, Website Scraper, Categories,
Coming Pincodes, SSH Terminal, Server Info, Google Category.

## Setup

Requires Flutter 3.41+ (channel `stable`). `flutter --version` should show
`Dart 3.11.5` or newer.

```bash
cd flutter-admin
flutter pub get
```

## Run

```bash
flutter run -d chrome      # web (fastest dev loop)
flutter run -d windows     # Windows desktop (if your install enables it)
flutter run                # picks first connected Android/iOS device
```

The login screen lets you type the backend URL at runtime. Defaults to the
deployed production cluster; for local development override with
`http://localhost:5000`.

## Build

```bash
flutter build web    --release      # static site, deploys anywhere
flutter build apk    --release      # Android (debug-signed)
flutter build appbundle --release   # Play Store
flutter build ios    --release      # macOS only
```

## Tests

```bash
# All unit + widget tests (no network, runs in <5s)
flutter test

# Static analyzer
flutter analyze
```

Test coverage:

- `test/models_test.dart` — JSON parsing for `Device`, `Session`, `Job`,
  `ScrapedRecord`. Catches backend rename drift.
- `test/auth_service_test.dart` — URL normalization (`plain hostname →
  https://`, `localhost → http://`, trailing slash, etc.) + token restore
  + ApiClient header management.
- `test/providers_test.dart` — `DevicesProvider.filtered` (search + online
  + archive logic) + counts.
- `test/widget_test.dart` — `LoginPage` builds and renders the password +
  Sign-in button.

## Real-data smoke test

Hits the real backend with a live credential. **Not** run by `flutter test`
(lives under `test/integration/`):

```bash
cd flutter-admin
dart test/integration/backend_smoke.dart \
  --base-url=http://localhost:5000 \
  --password=YOUR_ADMIN_PASSWORD
```

It logs in, then GETs `/api/admin/devices`, `/api/admin/sessions`, and
`/api/admin/jobs` and prints a one-line summary per endpoint. Use this to
verify the model parsers still match the backend after a backend change.

## Architecture

```
lib/
  main.dart                     # Provider tree + auth gate (LoginPage|HomePage)
  config.dart                   # Default base URL, timeouts, refresh interval
  theme.dart                    # Dark-slate theme matching the Electron admin
  services/
    api_client.dart             # Single Dio instance + Bearer interceptor + 401 hook
    auth_service.dart           # Login / logout / URL-normalize / SharedPreferences
  providers/
    auth_provider.dart          # ChangeNotifier — drives the LoginPage/HomePage switch
    devices_provider.dart       # Device list + filter helpers
    sessions_provider.dart      # SessionsProvider + JobsProvider
  models/
    device.dart                 # Device + LatestStats + RecentTotals
    session.dart                # Session + Job + ScrapedRecord
  pages/
    login_page.dart
    home_page.dart              # Bottom-nav shell
    dashboard_page.dart         # Stat cards + auto-refresh
    devices_page.dart           # List + live stat bars
    sessions_page.dart
    jobs_page.dart
    settings_page.dart
test/
  models_test.dart
  auth_service_test.dart
  providers_test.dart
  widget_test.dart
  integration/
    backend_smoke.dart          # Real-data check — explicit credential required
```

Two design choices worth knowing:

1. **Single Dio** — every provider gets the same `ApiClient` instance so a
   401 anywhere routes through one interceptor and kicks the operator back to
   login uniformly. Same pattern the Electron admin uses (`lib/api.ts`).

2. **shared_preferences, not flutter_secure_storage** — tokens expire in 24h
   on the backend (`adminAuth.js`), so the operational risk of a plaintext
   prefs file is small. Switch to secure storage if the policy tightens.
