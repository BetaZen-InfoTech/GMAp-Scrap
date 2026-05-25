// Real-data smoke test — exercises the *actual* backend endpoints the app
// reads, without spinning up a Flutter device. Run with:
//
//     cd flutter-admin && dart test/integration/backend_smoke.dart \
//       --base-url=http://127.0.0.1:5000 --password=YOUR_ADMIN_PASSWORD
//
// or against the deployed cluster:
//
//     dart test/integration/backend_smoke.dart \
//       --base-url=https://gmap-scrap-backend-api.betazeninfotech.com \
//       --password=...
//
// Skipped from `flutter test` by living under test/integration/, which the
// default test runner doesn't pick up.

import 'dart:io';

import '../../lib/models/device.dart';
import '../../lib/models/session.dart';
import '../../lib/services/api_client.dart';
import '../../lib/services/auth_service.dart';

Future<void> main(List<String> args) async {
  final baseUrl = _flag(args, 'base-url');
  final password = _flag(args, 'password');
  if (baseUrl == null || password == null) {
    stderr.writeln('Usage: dart test/integration/backend_smoke.dart '
        '--base-url=URL --password=PASS');
    exit(2);
  }

  print('▶ Backend smoke test against $baseUrl');
  final api = ApiClient();
  final auth = AuthService(api);

  // ── 1. Login ──────────────────────────────────────────────────────────────
  await auth.setBaseUrl(baseUrl);
  final loginErr = await auth.login(password);
  if (loginErr != null) {
    stderr.writeln('  ✗ Login failed: $loginErr');
    exit(1);
  }
  print('  ✓ Login succeeded (token: ${auth.token!.substring(0, 8)}…)');

  // ── 2. Devices ────────────────────────────────────────────────────────────
  try {
    final res = await api.dio.get('/api/admin/devices');
    final raw = res.data is List ? res.data : <dynamic>[];
    final devices = raw
        .whereType<Map<String, dynamic>>()
        .map(Device.fromJson)
        .toList();
    final online = devices.where((d) => d.isOnline).length;
    print('  ✓ /api/admin/devices → ${devices.length} devices ($online online)');
    if (devices.isEmpty) {
      stderr.writeln('  ! Empty device list — backend has no registered devices yet.');
    }
  } catch (e) {
    stderr.writeln('  ✗ /api/admin/devices failed: $e');
    exit(1);
  }

  // ── 3. Sessions ───────────────────────────────────────────────────────────
  try {
    final res = await api.dio.get('/api/admin/sessions', queryParameters: {'page': 1, 'limit': 5});
    final data = res.data['data'] ?? res.data['sessions'] ?? const [];
    final list = (data as List).whereType<Map<String, dynamic>>().map(Session.fromJson).toList();
    print('  ✓ /api/admin/sessions → ${list.length} on page 1 (total: ${res.data['total']})');
  } catch (e) {
    stderr.writeln('  ✗ /api/admin/sessions failed: $e');
    exit(1);
  }

  // ── 4. Jobs ───────────────────────────────────────────────────────────────
  try {
    final res = await api.dio.get('/api/admin/jobs', queryParameters: {'page': 1, 'limit': 5});
    final data = res.data['data'] ?? res.data['jobs'] ?? const [];
    final list = (data as List).whereType<Map<String, dynamic>>().map(Job.fromJson).toList();
    print('  ✓ /api/admin/jobs → ${list.length} on page 1');
  } catch (e) {
    stderr.writeln('  ✗ /api/admin/jobs failed: $e');
    exit(1);
  }

  print('\nAll endpoints reachable. ✓');
}

String? _flag(List<String> args, String name) {
  final prefix = '--$name=';
  for (final a in args) {
    if (a.startsWith(prefix)) return a.substring(prefix.length);
  }
  return null;
}
