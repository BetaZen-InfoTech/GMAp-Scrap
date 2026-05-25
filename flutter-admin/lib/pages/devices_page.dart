import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../models/device.dart';
import '../providers/devices_provider.dart';
import '../theme.dart';

class DevicesPage extends StatefulWidget {
  const DevicesPage({super.key});

  @override
  State<DevicesPage> createState() => _DevicesPageState();
}

class _DevicesPageState extends State<DevicesPage> {
  Timer? _ticker;
  String _search = '';
  int _tab = 0; // 0=all, 1=online, 2=offline

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DevicesProvider>().fetch();
    });
    _ticker = Timer.periodic(AppConfig.autoRefreshInterval, (_) {
      if (mounted) context.read<DevicesProvider>().fetch();
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  bool? get _onlineFilter => switch (_tab) { 1 => true, 2 => false, _ => null };

  @override
  Widget build(BuildContext context) {
    return Consumer<DevicesProvider>(
      builder: (context, dp, _) {
        final list = dp.filtered(search: _search, online: _onlineFilter);
        return Column(
          children: [
            // Header + search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  const Text('Devices',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text('${dp.onlineCount} online · ${dp.offlineCount} offline',
                    style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                onChanged: (v) => setState(() => _search = v),
                decoration: const InputDecoration(
                  hintText: 'Search IP, nickname, hostname',
                  prefixIcon: Icon(Icons.search, size: 18),
                  isDense: true,
                ),
              ),
            ),
            // Tabs
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: SegmentedButton<int>(
                segments: [
                  ButtonSegment(value: 0, label: Text('All (${dp.devices.length})')),
                  ButtonSegment(value: 1, label: Text('Online (${dp.onlineCount})')),
                  ButtonSegment(value: 2, label: Text('Offline (${dp.offlineCount})')),
                ],
                selected: {_tab},
                onSelectionChanged: (s) => setState(() => _tab = s.first),
              ),
            ),

            Expanded(
              child: RefreshIndicator(
                onRefresh: () => dp.fetch(),
                child: dp.isLoading && dp.devices.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : list.isEmpty
                        ? Center(
                            child: Text(
                              dp.error ?? 'No devices match',
                              style: const TextStyle(color: AppTheme.textMuted),
                            ),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: list.length,
                            separatorBuilder: (_, i) => const SizedBox(height: 8),
                            itemBuilder: (_, i) => _DeviceCard(d: list[i]),
                          ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _DeviceCard extends StatelessWidget {
  final Device d;
  const _DeviceCard({required this.d});

  @override
  Widget build(BuildContext context) {
    final stats = d.latestStats;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(d.displayName,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: (d.isOnline ? AppTheme.success : AppTheme.danger)
                      .withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(d.isOnline ? 'Online' : 'Offline',
                  style: TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w600,
                    color: d.isOnline ? AppTheme.success : AppTheme.danger,
                  )),
              ),
            ]),
            if (d.cpuModel != null) ...[
              const SizedBox(height: 4),
              Text('${d.cpuModel} · ${d.cpuCores ?? '?'} cores · ${d.totalMemoryGB ?? '?'} GB',
                style: const TextStyle(fontSize: 11, color: AppTheme.textFaint)),
            ],

            if (stats != null) ...[
              const SizedBox(height: 12),
              _Bar(label: 'CPU',  pct: stats.cpuUsedPercent),
              const SizedBox(height: 6),
              _Bar(label: 'RAM',  pct: stats.ramUsedPercent),
              const SizedBox(height: 6),
              _Bar(label: 'Disk', pct: stats.diskUsedPercent),
            ],

            const SizedBox(height: 10),
            Row(
              children: [
                _Stat(label: 'Records', value: '${d.recentRecords.total}', sub: '~${d.recentRecords.avg10min}/10min'),
                const SizedBox(width: 16),
                _Stat(label: 'Sessions', value: '${d.recentSessions.total}', sub: '~${d.recentSessions.avg10min}/10min'),
                const Spacer(),
                if (d.activeJobs > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text('${d.activeJobs} jobs running',
                      style: const TextStyle(fontSize: 11, color: AppTheme.primary)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  final String label;
  final double pct;
  const _Bar({required this.label, required this.pct});

  @override
  Widget build(BuildContext context) {
    final colour = pct >= 85
        ? AppTheme.danger
        : pct >= 60 ? AppTheme.warning : AppTheme.success;
    return Row(
      children: [
        SizedBox(width: 40, child: Text(label,
          style: const TextStyle(fontSize: 11, color: AppTheme.textMuted))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (pct / 100).clamp(0, 1),
              minHeight: 6,
              backgroundColor: AppTheme.surfaceAlt,
              valueColor: AlwaysStoppedAnimation(colour),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 36, child: Text('${pct.toStringAsFixed(0)}%',
          textAlign: TextAlign.right,
          style: const TextStyle(fontSize: 11, color: AppTheme.textMuted))),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  const _Stat({required this.label, required this.value, required this.sub});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
          style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600,
            color: AppTheme.textFaint, letterSpacing: 0.5)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        Text(sub, style: const TextStyle(fontSize: 10, color: AppTheme.textFaint)),
      ],
    );
  }
}
