import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../models/session.dart';
import '../services/api_client.dart';

/// Sessions + jobs list, paginated. Same /api/admin/sessions and
/// /api/admin/jobs endpoints the Electron admin uses.
class SessionsProvider extends ChangeNotifier {
  final ApiClient _api;
  SessionsProvider(this._api);

  List<Session> _sessions = [];
  List<Session> get sessions => _sessions;

  int _total = 0;
  int get total => _total;

  int _page = 1;
  int get page => _page;

  int _limit = 25;
  int get limit => _limit;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  Future<void> fetch({int? page, int? limit}) async {
    _isLoading = true;
    _error = null;
    if (page != null) _page = page;
    if (limit != null) _limit = limit;
    notifyListeners();

    try {
      final res = await _api.dio.get('/api/admin/sessions', queryParameters: {
        'page': _page,
        'limit': _limit,
      });
      final data = res.data['data'] ?? res.data['sessions'] ?? const [];
      final list = data is List ? data : <dynamic>[];
      _sessions = list
          .whereType<Map<String, dynamic>>()
          .map(Session.fromJson)
          .toList();
      _total = (res.data['total'] as num?)?.toInt() ?? _sessions.length;
    } on DioException catch (e) {
      _error = e.message ?? 'Failed to load sessions';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}

class JobsProvider extends ChangeNotifier {
  final ApiClient _api;
  JobsProvider(this._api);

  List<Job> _jobs = [];
  List<Job> get jobs => _jobs;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  Future<void> fetch({int page = 1, int limit = 50}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _api.dio.get('/api/admin/jobs', queryParameters: {
        'page': page, 'limit': limit,
      });
      final data = res.data['data'] ?? res.data['jobs'] ?? const [];
      final list = data is List ? data : <dynamic>[];
      _jobs = list
          .whereType<Map<String, dynamic>>()
          .map(Job.fromJson)
          .toList();
    } on DioException catch (e) {
      _error = e.message ?? 'Failed to load jobs';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
