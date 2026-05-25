import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config.dart';
import 'pages/home_page.dart';
import 'pages/login_page.dart';
import 'providers/auth_provider.dart';
import 'providers/devices_provider.dart';
import 'providers/sessions_provider.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ── Build the dependency tree once, share singletons via Provider.
  // ApiClient owns the single Dio instance — every provider gets a reference
  // to it, so a 401 from any page routes through the same interceptor.
  final api = ApiClient();
  final authService = AuthService(api);
  await authService.restore(); // Pull saved token from prefs before first paint.

  runApp(MyApp(api: api, authService: authService));
}

class MyApp extends StatelessWidget {
  final ApiClient api;
  final AuthService authService;
  const MyApp({super.key, required this.api, required this.authService});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider.value(value: api),
        ChangeNotifierProvider(create: (_) => AuthProvider(authService, api)),
        ChangeNotifierProvider(create: (_) => DevicesProvider(api)),
        ChangeNotifierProvider(create: (_) => SessionsProvider(api)),
        ChangeNotifierProvider(create: (_) => JobsProvider(api)),
      ],
      child: MaterialApp(
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        // Switch between LoginPage and HomePage based on whether we have a
        // token. Consumer rebuilds when AuthProvider notifies (login success,
        // logout, or 401 caught by the dio interceptor).
        home: Consumer<AuthProvider>(
          builder: (context, auth, _) =>
              auth.isAuthenticated ? const HomePage() : const LoginPage(),
        ),
      ),
    );
  }
}
