import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/session.dart';
import '../providers/sessions_provider.dart';
import '../theme.dart';

class JobsPage extends StatefulWidget {
  const JobsPage({super.key});

  @override
  State<JobsPage> createState() => _JobsPageState();
}

class _JobsPageState extends State<JobsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<JobsProvider>().fetch();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<JobsProvider>(
      builder: (context, jp, _) {
        return Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Jobs',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => jp.fetch(),
                child: jp.isLoading && jp.jobs.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : jp.jobs.isEmpty
                        ? Center(
                            child: Text(jp.error ?? 'No jobs',
                              style: const TextStyle(color: AppTheme.textMuted)),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: jp.jobs.length,
                            separatorBuilder: (_, i) => const SizedBox(height: 8),
                            itemBuilder: (_, i) => _JobCard(j: jp.jobs[i]),
                          ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _JobCard extends StatelessWidget {
  final Job j;
  const _JobCard({required this.j});

  @override
  Widget build(BuildContext context) {
    final color = switch (j.status) {
      'running'   => AppTheme.primary,
      'completed' => AppTheme.success,
      'stopped'   => AppTheme.warning,
      'stop'      => AppTheme.warning,
      _           => AppTheme.textMuted,
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(
                'Pin ${j.startPincode ?? '?'} → ${j.endPincode ?? '?'}',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(j.status,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
              ),
            ]),
            const SizedBox(height: 4),
            Text('Job ${j.jobId?.substring(0, j.jobId!.length.clamp(0, 8)) ?? ''}',
              style: const TextStyle(fontSize: 11, color: AppTheme.textFaint, fontFamily: 'monospace')),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: j.progressPercent / 100,
                minHeight: 6,
                backgroundColor: AppTheme.surfaceAlt,
                valueColor: AlwaysStoppedAnimation(color),
              ),
            ),
            const SizedBox(height: 4),
            Text('${j.completedSearches} / ${j.totalSearches}'
              ' · ${j.progressPercent.toStringAsFixed(1)}%',
              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
          ],
        ),
      ),
    );
  }
}
