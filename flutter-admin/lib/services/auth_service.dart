import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import 'api_client.dart';

/// Handles login + logout against `POST /api/admin/login` and persists the
/// resulting Bearer token + the base URL the operator typed at login. On app
/// start, `restore()` puts the saved token back on the dio instance so the
/// user lands directly on the dashboard if their token's still valid.
class AuthService {
  static const _kTokenKey = 'admin_token';
  static const _kBaseUrlKey = 'admin_base_url';

  final ApiClient _api;
  AuthService(this._api);

  /// Pulled from shared_preferences on app start. Null while we haven't
  /// loaded yet OR when the user is logged out.
  String? _token;
  String? get token => _token;

  String get baseUrl => _api.baseUrl;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(_kBaseUrlKey);
    if (savedUrl != null && savedUrl.isNotEmpty) {
      _api.setBaseUrl(savedUrl);
    }
    final savedToken = prefs.getString(_kTokenKey);
    if (savedToken != null && savedToken.isNotEmpty) {
      _token = savedToken;
      _api.setAuthToken(savedToken);
    }
  }

  /// Persist + apply a new base URL (operator-typed at the login screen).
  Future<void> setBaseUrl(String url) async {
    final normalized = _normalizeUrl(url);
    _api.setBaseUrl(normalized);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kBaseUrlKey, normalized);
  }

  /// Calls POST /api/admin/login with the password; on 200 stores the token
  /// and returns null. On any failure returns an error message string so the
  /// UI can render it inline.
  Future<String?> login(String password) async {
    try {
      final res = await _api.dio.post(
        '/api/admin/login',
        data: {'password': password},
      );
      final ok = res.data?['success'] == true;
      final token = res.data?['token']?.toString();
      if (!ok || token == null || token.isEmpty) {
        return res.data?['error']?.toString() ?? 'Login failed';
      }
      _token = token;
      _api.setAuthToken(token);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kTokenKey, token);
      return null;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) return 'Invalid admin password';
      return e.response?.data?['error']?.toString() ?? e.message ?? 'Network error';
    } catch (e) {
      return e.toString();
    }
  }

  Future<void> logout() async {
    _token = null;
    _api.setAuthToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kTokenKey);
  }

  /// Trim + auto-prepend https:// so operators can type 'api.foo.com' and it
  /// just works. Removes trailing slash so route paths concat cleanly.
  String _normalizeUrl(String input) {
    var s = input.trim();
    if (s.isEmpty) return AppConfig.defaultBaseUrl;
    if (!s.startsWith('http://') && !s.startsWith('https://')) {
      // localhost / 127.0.0.1 → http (no TLS by default); everything else https
      final isLoopback = s.startsWith('localhost') || s.startsWith('127.0.0.1');
      s = (isLoopback ? 'http://' : 'https://') + s;
    }
    if (s.endsWith('/')) s = s.substring(0, s.length - 1);
    return s;
  }
}
