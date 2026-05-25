import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_admin/services/api_client.dart';
import 'package:flutter_admin/services/auth_service.dart';

// Exercises AuthService URL normalization + ApiClient header management.
// Uses SharedPreferences.setMockInitialValues to seed an in-memory store —
// that's the supported way to test code that uses shared_preferences without
// spinning up a real platform channel.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('URL normalization (observable via setBaseUrl)', () {
    test('plain hostname → https://', () async {
      final api = ApiClient();
      final svc = AuthService(api);
      await svc.setBaseUrl('api.example.com');
      expect(api.baseUrl, 'https://api.example.com');
    });

    test('localhost → http://', () async {
      final api = ApiClient();
      final svc = AuthService(api);
      await svc.setBaseUrl('localhost:5000');
      expect(api.baseUrl, 'http://localhost:5000');
    });

    test('127.0.0.1 → http://', () async {
      final api = ApiClient();
      final svc = AuthService(api);
      await svc.setBaseUrl('127.0.0.1:5000');
      expect(api.baseUrl, 'http://127.0.0.1:5000');
    });

    test('strips trailing slash', () async {
      final api = ApiClient();
      final svc = AuthService(api);
      await svc.setBaseUrl('https://api.example.com/');
      expect(api.baseUrl, 'https://api.example.com');
    });

    test('keeps explicit scheme', () async {
      final api = ApiClient();
      final svc = AuthService(api);
      await svc.setBaseUrl('http://api.example.com');
      expect(api.baseUrl, 'http://api.example.com');
    });

    test('empty input falls back to default config', () async {
      final api = ApiClient();
      final svc = AuthService(api);
      await svc.setBaseUrl('   ');
      expect(api.baseUrl.startsWith('https://'), true);
    });
  });

  group('AuthService.restore', () {
    test('reads saved base URL + token from prefs', () async {
      SharedPreferences.setMockInitialValues({
        'admin_base_url': 'https://restored.example.com',
        'admin_token': 'restored-token',
      });
      final api = ApiClient();
      final svc = AuthService(api);
      await svc.restore();
      expect(api.baseUrl, 'https://restored.example.com');
      expect(svc.token, 'restored-token');
      expect(api.dio.options.headers['Authorization'], 'Bearer restored-token');
    });

    test('leaves dio unchanged when no prefs exist', () async {
      final api = ApiClient();
      final defaultUrl = api.baseUrl;
      final svc = AuthService(api);
      await svc.restore();
      expect(api.baseUrl, defaultUrl);
      expect(svc.token, isNull);
      expect(api.dio.options.headers.containsKey('Authorization'), false);
    });
  });

  group('ApiClient', () {
    test('setAuthToken sets / clears Authorization header', () {
      final api = ApiClient();
      api.setAuthToken('abc-token');
      expect(api.dio.options.headers['Authorization'], 'Bearer abc-token');
      api.setAuthToken(null);
      expect(api.dio.options.headers.containsKey('Authorization'), false);
      api.setAuthToken('');
      expect(api.dio.options.headers.containsKey('Authorization'), false);
    });
  });
}
