# Changelog

## 0.2.0

- Reactor handler options `retry` and `onError`; `retryAsync`, `singleFlight`; `reactor.hydrate(state)`; `persistReactor` (save / restore / migrate / debounce); `ReactorHistory` (bounded log + time travel); `combineObservers`; `HydratableSource`.
- Tracking: proxies stop recording after the render, `unwrapTracked` marks a value as identity-compared.
- Tests: seeded concurrency storms, a property test (tracked view equals a full-subscription view), token-refresh race, socket reconnect storm; coverage thresholds on `src/reactor` and `src/di`; GitHub Actions CI; `npm run verify`.
- `useReactorTracked` / `useReactorTrackedState` / `unwrapTracked`: proxy-based automatic dependency tracking, so a view re-renders only for the state properties it read. `ctx.patch(partial)` merges a partial into the state.
- `Reactor.own(child)`: a reactor owns child reactors (anything with `dispose()`), disposed with the parent, last owned first. Together with `ctx.listen(child, ...)` this composes flows from several reactors.

- `bm-react-native-env` CLI (and `scripts/bm-env` `generate()`): `.env` to an obfuscated TypeScript module, like Flutter's `envied`.

- `Reactor<State, Action, Effect>`: actions are declared as an interface (name -> payload) and used directly as the generic; `send.search({ query })` / `send.load()` to dispatch and `this.on.search(...)` to handle, with no action strings. State + one-shot effects with per-action transformers (`concurrent`, `sequential`, `restartable`, `droppable`), `listen` for streams, error routing and `ReactorObserver`. Hooks `useReactor`, `useReactorState`, `useReactorEffect`, `useReactorListener`, `createReactorContext`, `shallowEqual`, and test helpers `recordStates`, `recordEffects`, `waitForState`.
- `Locator` (`setup`, `get`, `isReady`, `reset`): a global accessor to the root container for code outside React, like GetIt in Flutter.
- Dependency injection: `Container` (singleton / scoped / transient, scopes, disposal, cycle detection), `createToken`, `DIProvider`, `DIScope`, `useResolve`.

- `WithViewState` bottom sheet: dimmed and blurred backdrop (`backdropColor`, `backdropBlur`, optional `expo-blur`), native-style corner radius (`sheetBorderRadius`, default 38 iOS / 28 Android), a grabber (`showGrabber`) and controlled visibility (`sheetVisible`, `onSheetDismiss`).
- Bottom sheet: shadow, and the dim / blur now covers the whole screen (previously the un-dimmed app showed beside the rounded corners).
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
