// Mirrors the DeviceInfo shape from the existing Electron admin
// (frontend-admin/src/shared/types.ts). Only fields we actually render are
// parsed — other backend fields are ignored quietly.

class LatestStats {
  final double cpuUsedPercent;
  final double ramUsedPercent;
  final double diskUsedPercent;
  final double ramUsedMB;
  final double ramTotalMB;
  final double diskUsedGB;
  final double diskTotalGB;
  final double netDownKBps;
  final double netUpKBps;

  const LatestStats({
    required this.cpuUsedPercent,
    required this.ramUsedPercent,
    required this.diskUsedPercent,
    required this.ramUsedMB,
    required this.ramTotalMB,
    required this.diskUsedGB,
    required this.diskTotalGB,
    required this.netDownKBps,
    required this.netUpKBps,
  });

  factory LatestStats.fromJson(Map<String, dynamic> j) => LatestStats(
        cpuUsedPercent:  _num(j['cpuUsedPercent']),
        ramUsedPercent:  _num(j['ramUsedPercent']),
        diskUsedPercent: _num(j['diskUsedPercent']),
        ramUsedMB:       _num(j['ramUsedMB']),
        ramTotalMB:      _num(j['ramTotalMB']),
        diskUsedGB:      _num(j['diskUsedGB']),
        diskTotalGB:     _num(j['diskTotalGB']),
        netDownKBps:     _num(j['netDownKBps']),
        netUpKBps:       _num(j['netUpKBps']),
      );
}

class RecentTotals {
  final int total;
  final int avg10min;
  const RecentTotals({required this.total, required this.avg10min});

  factory RecentTotals.fromJson(Map<String, dynamic>? j) => RecentTotals(
        total: (j?['total'] as num?)?.toInt() ?? 0,
        avg10min: (j?['avg10min'] as num?)?.toInt() ?? 0,
      );
}

class Device {
  final String deviceId;
  final String nickname;
  final String hostname;
  final String? ip;
  final String? cpuModel;
  final int? cpuCores;
  final double? totalMemoryGB;
  final String? platform;
  final String? osVersion;
  final String status; // 'online' | 'offline'
  final bool isArchived;
  final DateTime? lastSeenAt;
  final DateTime? createdAt;
  final LatestStats? latestStats;
  final int activeJobs;
  final int totalSessions;
  final RecentTotals recentRecords;
  final RecentTotals recentSessions;

  const Device({
    required this.deviceId,
    required this.nickname,
    required this.hostname,
    this.ip,
    this.cpuModel,
    this.cpuCores,
    this.totalMemoryGB,
    this.platform,
    this.osVersion,
    required this.status,
    required this.isArchived,
    this.lastSeenAt,
    this.createdAt,
    this.latestStats,
    required this.activeJobs,
    required this.totalSessions,
    required this.recentRecords,
    required this.recentSessions,
  });

  factory Device.fromJson(Map<String, dynamic> j) => Device(
        deviceId: j['deviceId'] as String? ?? '',
        nickname: (j['nickname'] as String?) ?? '',
        hostname: (j['hostname'] as String?) ?? '',
        ip:       j['ip'] as String?,
        cpuModel: j['cpuModel'] as String?,
        cpuCores: (j['cpuCores'] as num?)?.toInt(),
        totalMemoryGB: (j['totalMemoryGB'] as num?)?.toDouble(),
        platform: j['platform'] as String?,
        osVersion: j['osVersion'] as String?,
        status: (j['status'] as String?) ?? 'offline',
        isArchived: j['isArchived'] == true,
        lastSeenAt: _date(j['lastSeenAt']),
        createdAt:  _date(j['createdAt']),
        latestStats: j['latestStats'] is Map<String, dynamic>
            ? LatestStats.fromJson(j['latestStats'] as Map<String, dynamic>)
            : null,
        activeJobs:    (j['activeJobs']    as num?)?.toInt() ?? 0,
        totalSessions: (j['totalSessions'] as num?)?.toInt() ?? 0,
        recentRecords: RecentTotals.fromJson(
          (j['recent'] as Map<String, dynamic>?)?['records'] as Map<String, dynamic>?,
        ),
        recentSessions: RecentTotals.fromJson(
          (j['recent'] as Map<String, dynamic>?)?['sessions'] as Map<String, dynamic>?,
        ),
      );

  /// Display label — falls back through nickname → ip → hostname → id-stub
  String get displayName {
    if (nickname.isNotEmpty) return nickname;
    if (ip != null && ip!.isNotEmpty) return ip!;
    if (hostname.isNotEmpty) return hostname;
    return deviceId.substring(0, deviceId.length.clamp(0, 8));
  }

  bool get isOnline => status == 'online';
}

double _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is String) return DateTime.tryParse(v);
  return null;
}
