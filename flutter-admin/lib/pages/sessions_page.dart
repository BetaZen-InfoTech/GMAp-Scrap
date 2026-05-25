import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/session.dart';
import '../providers/sessions_provider.dart';
import '../theme.dart';

class SessionsPage extends StatefulWidget {
  const SessionsPage({super.key});

  @override
  State<SessionsPage> createState() => _SessionsPageState();
}

class _SessionsPageState extends State<SessionsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SessionsProvider>().fetch();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<SessionsProvider>(
      builder: (context, sp, _) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  const Text('Sessions',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text('${sp.total} total',
                    style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => sp.fetch(page: 1),
                child: sp.isLoading && sp.sessions.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : sp.sessions.isEmpty
                        ? Center(
                            child: Text(sp.error ?? 'No sessions',
                              style: const TextStyle(color: AppTheme.textMuted)),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: sp.sessions.length,
                            separatorBuilder: (_, i) => const SizedBox(height: 8),
                            itemBuilder: (_, i) => _SessionTile(s: sp.sessions[i]),
                          ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SessionTile extends StatelessWidget {
  final Session s;
  const _SessionTile({required this.s});

  @override
  Widget build(BuildContext context) {
    final color = switch (s.status) {
      'completed' => AppTheme.success,
      'error'     => AppTheme.danger,
      _           => AppTheme.textMuted,
    };
    final df = DateFormat('dd MMM HH:mm');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(
                s.keyword ?? 'session ${s.sessionId?.substring(0, 8) ?? ''}',
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(s.status,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
              ),
            ]),
            const SizedBox(height: 6),
            if (s.deviceName != null)
              Text(s.deviceName!,
                style: const TextStyle(fontSize: 11, color: AppTheme.textFaint)),
            const SizedBox(height: 8),
            Row(
              children: [
                _Pill(label: 'records',    value: '${s.totalRecords}'),
                const SizedBox(width: 8),
                _Pill(label: 'new',        value: '${s.insertedRecords}', color: AppTheme.success),
                const SizedBox(width: 8),
                _Pill(label: 'dup',        value: '${s.duplicateRecords}', color: AppTheme.warning),
                const SizedBox(width: 8),
                if (s.rounds.isNotEmpty) _Pill(label: 'rounds', value: s.rounds.join(',')),
              ],
            ),
            if (s.completedAt != null) ...[
              const SizedBox(height: 8),
              Text(df.format(s.completedAt!),
                style: const TextStyle(fontSize: 10, color: AppTheme.textFaint)),
            ],
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _Pill({required this.label, required this.value, this.color = AppTheme.textMuted});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTheme.surfaceAlt,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppTheme.border),
      ),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(fontSize: 11),
          children: [
            TextSpan(text: value,
              style: TextStyle(fontWeight: FontWeight.w600, color: color)),
            TextSpan(text: ' $label',
              style: const TextStyle(color: AppTheme.textFaint)),
          ],
        ),
      ),
    );
  }
}
