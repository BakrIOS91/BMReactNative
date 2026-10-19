# BMReactNative

React Native helpers ported from the Flutter packages **BMFlutter** and **BMRootJailbreakSniffer** (bloc / riverpod helpers are intentionally left out). Written in TypeScript; works with Expo (dev client) and bare React Native.

```bash
npm install bm-react-native
```

Optional peers (install what you use): `@react-native-async-storage/async-storage` and `expo-secure-store` (preferences), `jail-monkey` and `react-native-fs` (extra security checks). The sniffer needs a native rebuild (`pod install` on iOS); it does not run in Expo Go.

| Flutter | React Native |
|---|---|
| `DeviceHelper.getScalingFactor(context)` | `useScalingFactor()` / `useScaleValue()` |
| `DeviceRegistry.registerReferenceWidth` | same |
| `FontKey` / `FontRegistry` / `FontHelper.style` | same, plus `useFontStyle()` |
| `FontWeightProtocol` | `{ weightValue: number }` |
| `SupportedLocale` / `LanguageManager` | same |
| `ViewState` / `WithViewState` / `ErrorView` / `CustomError` | same (`ViewState` is a plain union with factories) |
| `AppCupertinoButton.filled/outlined` | `AppButton.filled/outlined` |
| `UnderlinedButton` | same |
| `@GeneratePreferences` + `BasePreferences` | `BasePreferences` with `userDefault` / `secure` / `inApp` fields (no codegen) |
| `preferencesListener` | `usePreferenceListener` |
| `DeviceSecurityHelper` / `Rjsniffer` | same |
| `emptyBlocListener`, SVG `.vec` builder | not ported |

## Scaling

Every size, spacing and radius should go through the scaling factor (reference width 440, clamped to 0.9-1.1 on phones, fixed 1.5 on tablets).

```tsx
import { DeviceRegistry, useScaleValue } from 'bm-react-native';

DeviceRegistry.registerReferenceWidth(390); // optional, once at startup

function Card() {
  const scale = useScaleValue();
  return <View style={{ padding: scale(16), borderRadius: scale(12) }} />;
}
```

## Typography

`FontHelper.style` already scales the size; never scale a font size again. Register families once (they must be loaded by the app) and look-ups of unregistered keys throw.

```tsx
FontRegistry.registerFont(FontKey.primary, 'Cairo');
FontRegistry.registerFont(FontKey.secondary, 'Inter');

enum AppFontWeight { regular = 400, medium = 500, bold = 700 }
const weight = (w: AppFontWeight) => ({ weightValue: w });

function Title() {
  const font = useFontStyle();
  return <Text style={font({ size: 24, weight: weight(AppFontWeight.bold), lineHeight: 1.4 })}>Welcome</Text>;
}
```

`lineHeight` is a multiplier of the scaled font size (React Native needs an absolute value, so it is converted for you).

## ViewState and WithViewState

```tsx
const [viewState, setViewState] = useState<ViewState>(ViewState.loading);

setViewState(ViewState.loaded);
setViewState(ViewState.noNetwork());
setViewState(ViewState.serverError({ errorModel: apiError }));
setViewState(ViewState.customError({ title: 'Oops', message: '...', onPress: retry }));

<WithViewState
  viewState={viewState}
  retryAction={load}
  isRefreshable
  errorDisplayMode="bottomSheet" // or "replace" (default)
  renderError={(state, retry) => <MyErrorScreen state={state} onRetry={retry} />}
>
  <Content />
</WithViewState>
```

In `bottomSheet` mode the content is dimmed (`backdropColor`) and blurred (`backdropBlur`, needs the optional `expo-blur` peer; without it only the dim shows). The sheet has native-style rounded top corners (`sheetBorderRadius`, default 38 on iOS / 28 on Android) and a grabber (`showGrabber`). Show or hide the sheet yourself with `sheetVisible` and react to taps with `onSheetDismiss`.

States: `loading`, `overlayLoading(color)`, `loaded`, and the errors `noNetwork`, `noData`, `serverError`, `unexpectedError`, `unauthorized`, `forceUpdate`, `jailBroken`, `searchError`, `customError` (`state.isError` is `true`). Without `renderError`, a plain English `ErrorView` is shown, so supply it to localise texts, pick images and wire per-state actions (login, exit, store update).

Mapping API failures to a `ViewState` is app specific, so it is left to the caller.

## Buttons, ErrorView

```tsx
<AppButton.filled title="Submit" onPress={submit} icon={<CheckIcon />} iconPosition="trailing" />
<AppButton.outlined title="Cancel" borderColor="red" onPress={back} />
<UnderlinedButton title="Forgot password?" onPress={reset} />
<ErrorView title="No Network" message="Check your connection." image={<Image source={offline} />} retryButton={<AppButton.filled title="Retry" onPress={retry} />} />
```

## Preferences

Fields are declared on a subclass; there is no code generation. Reads are synchronous, writes notify subscribers immediately and persist in the background.

```ts
class UserPreferences extends BasePreferences {
  themeMode = this.userDefault('theme_mode', 'light');          // AsyncStorage
  token = this.secure<string | null>('user_auth_token', null);  // expo-secure-store
  tempFlag = this.inApp(false);                                 // memory only
}

export const prefs = new UserPreferences();
await prefs.init();             // loads persisted values (await before first use)

prefs.themeMode.value = 'dark';
prefs.token.value = 'jwt_123';  // assign null to delete the secure entry
await prefs.flush();            // optional: wait for pending writes
```

Values are JSON encoded; pass a `{ encode, decode }` codec as the third argument for custom models. Pass `new UserPreferences({ storage, secureStorage, onPersistError })` to use other backends (`MemoryStorage` is handy in tests).

```tsx
const theme = usePreference(prefs.themeMode);                  // re-renders on change
usePreferenceListener(prefs.token, (token) => { if (token === null) logout(); });
```

## Device security

```ts
const result = await DeviceSecurityHelper.checkDeviceSecurity({
  expectedHash: '...', apkPath, ipaPath, exposedSecrets: ['API_SECRET'],
});
if (!result.isSecure) console.warn(result.reason);
```

Runs the native sniffer (root / jailbreak, emulator, debugger), `jail-monkey` when installed, Android SU / Magisk and Frida files, an optional SHA-256 binary check and an exposed-secret check. Web and other platforms always pass. `Rjsniffer.amICompromised()`, `amIEmulator()` and `amIDebugged()` are also exported directly and resolve `boolean | null`.

iOS: add the schemes the jailbreak check probes to `Info.plist`:

```xml
<key>LSApplicationQueriesSchemes</key>
<array><string>undecimus</string><string>sileo</string><string>zbra</string><string>filza</string><string>activator</string></array>
```

The Android and iOS sniffer code derives from [root_jailbreak_sniffer](https://github.com/romikavinda/root_jailbreak_sniffer) (Apache-2.0, (c) romikavinda), which builds on RootBeer, RootInspector, DetectMagiskHide and IOSSecuritySuite; see `LICENSE`.

## Testing

`npm test` (Jest, `react-test-renderer`). The native Android / iOS code is a direct port and has not been compiled in this repository; verify it in an app build before releasing.

## Example app

`example/` is an Expo app (dev client, not Expo Go) that exercises every helper and links the native sniffer:

```bash
cd example && npm install --legacy-peer-deps
npx expo run:ios      # or run:android; then: npm start
npm run typecheck
```
