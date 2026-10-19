# Changelog

## Unreleased

- `WithViewState` bottom sheet: dimmed and blurred backdrop (`backdropColor`, `backdropBlur`, optional `expo-blur`), native-style corner radius (`sheetBorderRadius`, default 38 iOS / 28 Android), a grabber (`showGrabber`) and controlled visibility (`sheetVisible`, `onSheetDismiss`).
- Fix: loader overlay no longer relies on `StyleSheet.absoluteFillObject`, which React Native 0.88 removed.

## 0.1.0

Initial React Native port of BMFlutter 0.1.11 and BMRootJailbreakSniffer 1.1.5.

- `DeviceHelper` / `DeviceRegistry` scaling (`useScalingFactor`, `useScaleValue`).
- `FontKey`, `FontRegistry`, `FontHelper.style`, `useFontStyle`, `FontWeightProtocol`.
- `SupportedLocale`, `LanguageManager`.
- `ViewState`, `CustomError`, `WithViewState`, `ErrorView`.
- `AppButton.filled` / `AppButton.outlined`, `UnderlinedButton`.
- Reactive persisted preferences (`BasePreferences`, `usePreference`, `usePreferenceListener`) replacing the annotation / `build_runner` generator.
- `DeviceSecurityHelper` and the `Rjsniffer` native module (Android RootBeer / RootInspector / Magisk Hide, iOS IOSSecuritySuite).

Not ported: everything bloc / riverpod related (`emptyBlocListener`, the `MultiBlocListener` form of `preferencesListener`) and the Flutter-only SVG `.vec` build_runner builder.
