import 'package:flutter/material.dart';

/// Dark slate palette matching the existing Electron admin (Tailwind slate-900
/// background, slate-800 surfaces, blue-500 primary). Keeps the two apps
/// recognisable as the same product.
class AppTheme {
  static const Color bg          = Color(0xFF020617); // slate-950
  static const Color surface     = Color(0xFF0F172A); // slate-900
  static const Color surfaceAlt  = Color(0xFF1E293B); // slate-800
  static const Color border      = Color(0xFF334155); // slate-700
  static const Color textMuted   = Color(0xFF94A3B8); // slate-400
  static const Color textFaint   = Color(0xFF64748B); // slate-500
  static const Color primary     = Color(0xFF3B82F6); // blue-500
  static const Color success     = Color(0xFF10B981); // emerald-500
  static const Color warning     = Color(0xFFF59E0B); // amber-500
  static const Color danger      = Color(0xFFEF4444); // red-500

  static ThemeData dark = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: bg,
    colorScheme: const ColorScheme.dark(
      primary: primary,
      surface: surface,
      onSurface: Colors.white,
      surfaceContainerHighest: surfaceAlt,
      outline: border,
      error: danger,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: surface,
      foregroundColor: Colors.white,
      elevation: 0,
      titleTextStyle: TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFF1E293B)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surfaceAlt,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
      labelStyle: const TextStyle(color: textMuted),
      hintStyle: const TextStyle(color: textFaint),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: surface,
      selectedItemColor: primary,
      unselectedItemColor: textMuted,
      type: BottomNavigationBarType.fixed,
    ),
    dividerTheme: const DividerThemeData(color: border, thickness: 1),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: surfaceAlt,
      contentTextStyle: const TextStyle(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
