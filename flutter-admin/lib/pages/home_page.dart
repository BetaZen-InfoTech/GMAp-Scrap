import 'package:flutter/material.dart';

import 'dashboard_page.dart';
import 'devices_page.dart';
import 'sessions_page.dart';
import 'jobs_page.dart';
import 'settings_page.dart';

/// Root scaffold once the operator is logged in. Bottom-nav between the
/// essential admin views. The Electron admin has more pages (Scrap DB, SSH,
/// etc.) — those are skipped on the mobile build because they're heavy /
/// keyboard-driven workflows that don't translate well to a phone.
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _tab = 0;

  final _tabs = const <Widget>[
    DashboardPage(),
    DevicesPage(),
    SessionsPage(),
    JobsPage(),
    SettingsPage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: _tabs[_tab]),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tab,
        onTap: (i) => setState(() => _tab = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), activeIcon: Icon(Icons.dashboard), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.dns_outlined),       activeIcon: Icon(Icons.dns),       label: 'Devices'),
          BottomNavigationBarItem(icon: Icon(Icons.list_alt_outlined),  activeIcon: Icon(Icons.list_alt),  label: 'Sessions'),
          BottomNavigationBarItem(icon: Icon(Icons.work_outline),       activeIcon: Icon(Icons.work),      label: 'Jobs'),
          BottomNavigationBarItem(icon: Icon(Icons.settings_outlined),  activeIcon: Icon(Icons.settings),  label: 'Settings'),
        ],
      ),
    );
  }
}
