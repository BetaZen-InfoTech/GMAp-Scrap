import 'package:dio/dio.dart';

import '../config.dart';

/// Thin wrapper around a single Dio instance with:
///   - configurable baseUrl (set/changed by the auth service at login)
///   - Bearer-token injection on every request
///   - a callback for 401 that the auth provider hooks into to force logout
///
/// Constructed once at app start and shared via Provider; every page reads
/// the same `dio` instance instead of building its own.
class ApiClient {
  final Dio dio;
  void Function()? _onUnauthorized;

  ApiClient._(this.dio);

  factory ApiClient() {
    final dio = Dio(BaseOptions(
      baseUrl: AppConfig.defaultBaseUrl,
      connectTimeout: const Duration(milliseconds: AppConfig.connectTimeoutMs),
      receiveTimeout: const Duration(milliseconds: AppConfig.receiveTimeoutMs),
      headers: {'Content-Type': 'application/json'},
    ));

    final client = ApiClient._(dio);

    dio.interceptors.add(InterceptorsWrapper(
      onError: (DioException e, handler) {
        // 401 from any admin endpoint = token expired or wrong. Kick the
        // operator back to the login screen via the auth provider's hook.
        if (e.response?.statusCode == 401) {
          client._onUnauthorized?.call();
        }
        return handler.next(e);
      },
    ));

    return client;
  }

  void setBaseUrl(String url) {
    dio.options.baseUrl = url;
  }

  String get baseUrl => dio.options.baseUrl;

  void setAuthToken(String? token) {
    if (token == null || token.isEmpty) {
      dio.options.headers.remove('Authorization');
    } else {
      dio.options.headers['Authorization'] = 'Bearer $token';
    }
  }

  void onUnauthorized(void Function() handler) {
    _onUnauthorized = handler;
  }
}
