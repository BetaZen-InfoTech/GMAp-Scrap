import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_admin/models/device.dart';
import 'package:flutter_admin/providers/devices_provider.dart';
import 'package:flutter_admin/services/api_client.dart';

// Test-only subclass that lets us seed the internal `devices` list without
// going through the real HTTP fetch. Keeps the production provider clean.
class _SeededDevicesProvider extends DevicesProvider {
  _SeededDevicesProvider(super.api);
  void seed(List<Map<String, dynamic>> raw) {
    devices
      ..clear()
      ..addAll(raw.map(Device.fromJson));
  }
}

void main() {
  group('DevicesProvider.filtered', () {
    late _SeededDevicesProvider p;
    setUp(() => p = _SeededDevicesProvider(ApiClient()));

    test('search matches nickname / IP / hostname', () {
      p.seed([
        {'deviceId': '1', 'nickname': 'srv-alpha', 'hostname': 'h1', 'ip': '10.0.0.1', 'status': 'online'},
        {'deviceId': '2', 'nickname': 'srv-beta',  'hostname': 'h2', 'ip': '10.0.0.2', 'status': 'offline'},
        {'deviceId': '3', 'nickname': '',          'hostname': 'gamma', 'ip': '10.0.0.3', 'status': 'online'},
      ]);
      expect(p.filtered(search: 'alpha').length, 1);
      expect(p.filtered(search: 'alpha').first.nickname, 'srv-alpha');
      expect(p.filtered(search: '0.0.3').length, 1);
      expect(p.filtered(search: 'gamma').length, 1);
      expect(p.filtered(search: 'zzzz').length, 0);
    });

    test('online filter narrows the list', () {
      p.seed([
        {'deviceId': '1', 'nickname': 'a', 'hostname': 'h', 'status': 'online'},
        {'deviceId': '2', 'nickname': 'b', 'hostname': 'h', 'status': 'online'},
        {'deviceId': '3', 'nickname': 'c', 'hostname': 'h', 'status': 'offline'},
      ]);
      expect(p.filtered(online: true).length, 2);
      expect(p.filtered(online: false).length, 1);
      expect(p.onlineCount, 2);
      expect(p.offlineCount, 1);
    });

    test('search + online filter compose', () {
      p.seed([
        {'deviceId': '1', 'nickname': 'srv-a', 'hostname': 'h', 'status': 'online'},
        {'deviceId': '2', 'nickname': 'srv-b', 'hostname': 'h', 'status': 'offline'},
      ]);
      expect(p.filtered(search: 'srv', online: true).length, 1);
      expect(p.filtered(search: 'srv', online: true).first.nickname, 'srv-a');
    });

    test('archived devices are excluded from offlineCount', () {
      p.seed([
        {'deviceId': '1', 'nickname': 'a', 'hostname': 'h', 'status': 'offline', 'isArchived': true},
        {'deviceId': '2', 'nickname': 'b', 'hostname': 'h', 'status': 'offline'},
      ]);
      expect(p.offlineCount, 1);
    });
  });
}
