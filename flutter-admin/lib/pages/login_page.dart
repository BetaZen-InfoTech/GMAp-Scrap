import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../providers/auth_provider.dart';
import '../theme.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  late final TextEditingController _baseUrlCtl;
  late final TextEditingController _passwordCtl;
  bool _showPassword = false;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthProvider>();
    _baseUrlCtl = TextEditingController(text: auth.baseUrl);
    _passwordCtl = TextEditingController();
  }

  @override
  void dispose() {
    _baseUrlCtl.dispose();
    _passwordCtl.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final auth = context.read<AuthProvider>();
    final ok = await auth.login(
      baseUrl: _baseUrlCtl.text,
      password: _passwordCtl.text,
    );
    if (!ok && mounted) {
      // Error rendered inline via Consumer<AuthProvider> below.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(auth.error ?? 'Login failed')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Consumer<AuthProvider>(
                  builder: (context, auth, _) => Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // ── Header
                      Row(
                        children: [
                          Container(
                            width: 40, height: 40,
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.shield_outlined, color: AppTheme.primary),
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(AppConfig.appName,
                                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                                Text('BetaZen InfoTech',
                                  style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // ── Backend URL
                      const Text('Backend API URL',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                          color: AppTheme.textMuted, letterSpacing: 0.5)),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _baseUrlCtl,
                        autocorrect: false,
                        keyboardType: TextInputType.url,
                        decoration: const InputDecoration(
                          hintText: 'https://api.example.com',
                          prefixIcon: Icon(Icons.cloud_outlined, size: 18),
                        ),
                        onChanged: (_) => auth.clearError(),
                      ),
                      const SizedBox(height: 16),

                      // ── Password
                      const Text('Admin password',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                          color: AppTheme.textMuted, letterSpacing: 0.5)),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _passwordCtl,
                        autocorrect: false,
                        obscureText: !_showPassword,
                        onSubmitted: (_) => _handleLogin(),
                        decoration: InputDecoration(
                          hintText: 'Enter admin password',
                          prefixIcon: const Icon(Icons.lock_outline, size: 18),
                          suffixIcon: IconButton(
                            icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 18),
                            onPressed: () => setState(() => _showPassword = !_showPassword),
                          ),
                        ),
                        onChanged: (_) => auth.clearError(),
                      ),

                      if (auth.error != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppTheme.danger.withValues(alpha: 0.1),
                            border: Border.all(color: AppTheme.danger.withValues(alpha: 0.4)),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline, size: 16, color: AppTheme.danger),
                              const SizedBox(width: 8),
                              Expanded(child: Text(auth.error!,
                                style: const TextStyle(color: AppTheme.danger, fontSize: 13))),
                            ],
                          ),
                        ),
                      ],

                      const SizedBox(height: 20),
                      SizedBox(
                        height: 44,
                        child: ElevatedButton(
                          onPressed: auth.isLoading ? null : _handleLogin,
                          child: auth.isLoading
                              ? const SizedBox(
                                  width: 20, height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Text('Sign in', style: TextStyle(fontWeight: FontWeight.w600)),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text('v${AppConfig.appVersion}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 11, color: AppTheme.textFaint)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
