import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../providers/devices_provider.dart';
import '../theme.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Kick first fetch + start the auto-refresh ticker. The page rebuilds when
    // the provider notifies, so we don't store any local snapshot here.
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

  @override
  Widget build(BuildContext context) {
    return Consumer<DevicesProvider>(
      builder: (context, dp, _) {
        final online = dp.onlineCount;
        final offline = dp.offlineCount;
        final total = dp.devices.length;
        final flagged = dp.devices.where((d) =>
          d.isOnline && (d.recentRecords.total < 3000 || d.recentSessions.total < 100)).length;

        return RefreshIndicator(
          onRefresh: () => dp.fetch(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 8, bottom: 16),
                child: Text('Overview',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              ),

              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.6,
                children: [
                  _StatCard(label: 'Total devices', value: '$total',
                    icon: Icons.dns_outlined, color: AppTheme.primary),
                  _StatCard(label: 'Online', value: '$online',
                    icon: Icons.circle, color: AppTheme.success),
                  _StatCard(label: 'Offline', value: '$offline',
                    icon: Icons.circle_outlined, color: AppTheme.textMuted),
                  _StatCard(label: 'Flagged', value: '$flagged',
                    icon: Icons.flag_outlined, color: AppTheme.warning),
                ],
              ),

              const SizedBox(height: 20),
              if (dp.error != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.danger.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppTheme.danger.withValues(alpha: 0.4)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.error_outline, color: AppTheme.danger, size: 18),
                    const SizedBox(width: 8),
                    Expanded(child: Text(dp.error!,
                      style: const TextStyle(color: AppTheme.danger, fontSize: 13))),
                  ]),
                ),

              if (dp.lastFetchedAt != null) ...[
                const SizedBox(height: 12),
                Center(child: Text(
                  'Updated ${_relative(dp.lastFetchedAt!)}',
                  style: const TextStyle(fontSize: 11, color: AppTheme.textFaint),
                )),
              ],

              if (dp.isLoading && dp.devices.isEmpty) ...[
                const SizedBox(height: 40),
                const Center(child: CircularProgressIndicator()),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(label.toUpperCase(),
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted, letterSpacing: 0.5)),
            ]),
            Text(value,
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

String _relative(DateTime when) {
  final diff = DateTime.now().difference(when);
  if (diff.inSeconds < 10) return 'just now';
  if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  return '${diff.inHours}h ago';
}
