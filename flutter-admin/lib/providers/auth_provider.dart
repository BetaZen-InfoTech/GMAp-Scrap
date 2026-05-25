import 'package:flutter/foundation.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';

/// Single source of truth for "am I logged in?". Wraps AuthService so widgets
/// can listen via Provider and re-route between LoginPage and HomePage.
class AuthProvider extends ChangeNotifier {
  final AuthService _service;
  final ApiClient _api;

  AuthProvider(this._service, this._api) {
    // When dio sees a 401 anywhere, kick the operator back to login.
    _api.onUnauthorized(() {
      _service.logout();
      notifyListeners();
    });
  }

  bool get isAuthenticated => _service.token != null && _service.token!.isNotEmpty;
  String get baseUrl => _service.baseUrl;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  Future<void> restore() async {
    await _service.restore();
    notifyListeners();
  }

  Future<bool> login({required String baseUrl, required String password}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    await _service.setBaseUrl(baseUrl);
    final err = await _service.login(password);

    _isLoading = false;
    _error = err;
    notifyListeners();

    return err == null;
  }

  Future<void> logout() async {
    await _service.logout();
    notifyListeners();
  }

  void clearError() {
    if (_error != null) {
      _error = null;
      notifyListeners();
    }
  }
}
