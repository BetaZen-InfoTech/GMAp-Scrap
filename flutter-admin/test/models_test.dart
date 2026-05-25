import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_admin/models/device.dart';
import 'package:flutter_admin/models/session.dart';

// Pure-Dart unit tests — no Flutter binding needed.
// These exercise the JSON shapes the backend actually emits so a model rename
// on either side fails loudly here instead of producing silent zeros at runtime.
void main() {
  group('Device.fromJson', () {
    test('parses a fully-populated device payload', () {
      final json = {
        'deviceId': 'abc-123',
        'nickname': 'pc-1',
        'hostname': 'srv1',
        'ip': '187.127.165.150',
        'cpuModel': 'AMD EPYC 9355P',
        'cpuCores': 8,
        'totalMemoryGB': 31.34,
        'platform': 'linux',
        'osVersion': '6.8.0',
        'status': 'online',
        'isArchived': false,
        'lastSeenAt': '2026-05-16T07:00:00Z',
        'createdAt':  '2026-04-01T00:00:00Z',
        'latestStats': {
          'cpuUsedPercent': 47, 'ramUsedPercent': 8, 'diskUsedPercent': 1,
          'ramUsedMB': 2536.0, 'ramTotalMB': 32095.0,
          'diskUsedGB': 4.3,    'diskTotalGB': 386.4,
          'netDownKBps': 12.0,  'netUpKBps': 4.0,
        },
        'activeJobs': 3,
        'totalSessions': 469,
        'recent': {
          'records':  {'total': 5851, 'avg10min': 975},
          'sessions': {'total': 69,   'avg10min': 12},
        },
      };
      final d = Device.fromJson(json);
      expect(d.deviceId, 'abc-123');
      expect(d.displayName, 'pc-1');
      expect(d.isOnline, true);
      expect(d.cpuCores, 8);
      expect(d.totalMemoryGB, 31.34);
      expect(d.latestStats!.cpuUsedPercent, 47);
      expect(d.recentRecords.total, 5851);
      expect(d.activeJobs, 3);
    });

    test('falls back to IP/hostname when nickname is empty', () {
      final d = Device.fromJson({
        'deviceId': 'xx-12345678', 'nickname': '',
        'hostname': 'srv2', 'ip': '10.0.0.1', 'status': 'offline',
      });
      expect(d.displayName, '10.0.0.1');
      final d2 = Device.fromJson({
        'deviceId': 'xx-87654321', 'nickname': '',
        'hostname': 'srv3', 'status': 'offline',
      });
      expect(d2.displayName, 'srv3');
    });

    test('tolerates missing latestStats / recent / archived', () {
      final d = Device.fromJson({
        'deviceId': 'x', 'nickname': 'n', 'hostname': 'h', 'status': 'offline',
      });
      expect(d.latestStats, isNull);
      expect(d.recentRecords.total, 0);
      expect(d.isArchived, false);
      expect(d.isOnline, false);
    });
  });

  group('Session.fromJson', () {
    test('parses status, rounds, and counts', () {
      final s = Session.fromJson({
        '_id': 'objid-1', 'sessionId': 's1', 'jobId': 'j1', 'deviceId': 'd1',
        'keyword': 'cafe near me', 'pincode': 700001, 'rounds': [1, 2, 3],
        'totalRecords': 30, 'insertedRecords': 25, 'duplicateRecords': 5,
        'batchesSent': 3, 'status': 'completed',
        'startedAt': '2026-05-16T06:00:00Z',
        'completedAt': '2026-05-16T06:05:00Z',
        'durationMs': 300000,
      });
      expect(s.totalRecords, 30);
      expect(s.insertedRecords, 25);
      expect(s.duplicateRecords, 5);
      expect(s.rounds, [1, 2, 3]);
      expect(s.status, 'completed');
      expect(s.completedAt!.year, 2026);
    });

    test('defaults to status=completed and empty rounds when missing', () {
      final s = Session.fromJson({'sessionId': 's1'});
      expect(s.status, 'completed');
      expect(s.rounds, isEmpty);
      expect(s.totalRecords, 0);
    });
  });

  group('Job.progressPercent', () {
    test('100% when total == completed', () {
      final j = Job.fromJson({'totalSearches': 200, 'completedSearches': 200});
      expect(j.progressPercent, 100);
    });
    test('clamped to 0 when total is 0', () {
      final j = Job.fromJson({'totalSearches': 0, 'completedSearches': 0});
      expect(j.progressPercent, 0);
    });
    test('half-progress reports 50%', () {
      final j = Job.fromJson({'totalSearches': 200, 'completedSearches': 100});
      expect(j.progressPercent, 50);
    });
  });

  group('ScrapedRecord.fromJson', () {
    test('parses dedup flags', () {
      final r = ScrapedRecord.fromJson({
        '_id': 'r1', 'name': 'Cafe X', 'phone': '+919876543210',
        'isDuplicate': true, 'scrapWebsite': true,
      });
      expect(r.isDuplicate, true);
      expect(r.scrapWebsite, true);
    });
  });
}
