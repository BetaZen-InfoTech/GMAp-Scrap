import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:flutter_admin/pages/login_page.dart';
import 'package:flutter_admin/providers/auth_provider.dart';
import 'package:flutter_admin/services/api_client.dart';
import 'package:flutter_admin/services/auth_service.dart';
import 'package:flutter_admin/theme.dart';

// Lightweight widget smoke-check: the login page mounts cleanly and renders
// the expected fields. We can't (and shouldn't) hit the real network from a
// unit test, so this just verifies the widget tree builds.
void main() {
  testWidgets('LoginPage builds and shows the password + Sign-in button',
      (tester) async {
    final api = ApiClient();
    final authService = AuthService(api);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider(create: (_) => AuthProvider(authService, api)),
        ],
        child: MaterialApp(theme: AppTheme.dark, home: const LoginPage()),
      ),
    );

    expect(find.text('BetaZen Admin'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(2)); // URL + password
  });
}
