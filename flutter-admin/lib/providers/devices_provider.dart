import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../models/device.dart';
import '../services/api_client.dart';

/// Holds the list of registered VPSes + lets pages refresh it. Matches the
/// behaviour of useDeviceStore in the Electron admin: hit /api/admin/devices,
/// keep the latest snapshot in memory, expose loading/error state, allow
/// manual refresh (also driven by the 30s auto-refresh ticker in the page).
class DevicesProvider extends ChangeNotifier {
  final ApiClient _api;
  DevicesProvider(this._api);

  List<Device> _devices = [];
  List<Device> get devices => _devices;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  DateTime? _lastFetchedAt;
  DateTime? get lastFetchedAt => _lastFetchedAt;

  Future<void> fetch({bool includeArchived = false}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _api.dio.get(
        '/api/admin/devices',
        queryParameters: includeArchived ? {'includeArchived': 'true'} : null,
      );
      final raw = res.data;
      final list = raw is List ? raw : <dynamic>[];
      _devices = list
          .whereType<Map<String, dynamic>>()
          .map(Device.fromJson)
          .toList();
      _lastFetchedAt = DateTime.now();
    } on DioException catch (e) {
      _error = e.response?.data is Map
          ? (e.response!.data['error']?.toString() ?? e.message)
          : (e.message ?? 'Failed to load devices');
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Filter helpers used by the devices page (search bar + tabs).
  List<Device> filtered({String search = '', bool? online}) {
    final s = search.trim().toLowerCase();
    return _devices.where((d) {
      if (online != null && d.isOnline != online) return false;
      if (s.isEmpty) return true;
      return d.nickname.toLowerCase().contains(s)
          || (d.ip ?? '').contains(s)
          || d.hostname.toLowerCase().contains(s);
    }).toList();
  }

  int get onlineCount => _devices.where((d) => d.isOnline).length;
  int get offlineCount => _devices.where((d) => !d.isOnline && !d.isArchived).length;
}
