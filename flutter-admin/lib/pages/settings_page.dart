import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../providers/auth_provider.dart';
import '../theme.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 8, bottom: 16),
          child: Text('Settings',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        ),

        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.cloud_outlined, color: AppTheme.textMuted),
                title: const Text('Backend API'),
                subtitle: Text(auth.baseUrl, style: const TextStyle(fontSize: 11)),
                trailing: const Icon(Icons.chevron_right, color: AppTheme.textFaint),
                onTap: () => _editBaseUrl(context),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.key_outlined, color: AppTheme.textMuted),
                title: const Text('Session'),
                subtitle: Text(auth.isAuthenticated ? 'Signed in' : 'Signed out',
                  style: TextStyle(
                    fontSize: 11,
                    color: auth.isAuthenticated ? AppTheme.success : AppTheme.textMuted,
                  )),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.info_outline, color: AppTheme.textMuted),
                title: const Text('Version'),
                subtitle: const Text('v${AppConfig.appVersion}',
                  style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),
        ElevatedButton.icon(
          onPressed: () async {
            final confirm = await showDialog<bool>(
              context: context,
              builder: (_) => AlertDialog(
                title: const Text('Sign out?'),
                content: const Text('You\'ll need to re-enter the admin password to sign back in.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Sign out'),
                  ),
                ],
              ),
            );
            if (confirm == true && context.mounted) {
              await context.read<AuthProvider>().logout();
            }
          },
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Sign out'),
          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
        ),
      ],
    );
  }

  Future<void> _editBaseUrl(BuildContext context) async {
    final auth = context.read<AuthProvider>();
    final controller = TextEditingController(text: auth.baseUrl);
    final next = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Backend API URL'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'https://api.example.com'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (next != null) {
      // Setting the URL also forces a logout so the operator re-authenticates
      // against the new backend — tokens issued on one server aren't valid on
      // another.
      await auth.logout();
      // Persist the new base URL via a no-op login attempt. Stash the messenger
      // before the await so we don't reach for context.mounted afterwards.
      if (!context.mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      await auth.login(baseUrl: next, password: '');
      messenger.showSnackBar(
        const SnackBar(content: Text('Backend URL updated — please sign in again')),
      );
    }
  }
}
