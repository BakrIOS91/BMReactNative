# BMReactNative

A TypeScript toolkit of React Native helpers for building consistent, resilient apps: responsive scaling, typography, view-state handling, buttons, typed preferences and device-security checks. Works with Expo (dev client) and bare React Native.

```bash
npm install bm-react-native
```

Optional peers (install what you use): `@react-native-async-storage/async-storage` and `expo-secure-store` (preferences), `expo-blur` (sheet backdrop blur), `jail-monkey` and `react-native-fs` (extra security checks). The sniffer needs a native rebuild (`pod install` on iOS); it does not run in Expo Go.

## What's included

| Area | Exports |
|---|---|
| Scaling | `useScalingFactor()`, `useScaleValue()`, `DeviceRegistry.registerReferenceWidth` |
| Typography | `FontKey`, `FontRegistry`, `FontHelper.style`, `useFontStyle()`, `{ weightValue: number }` weights |
| Localisation | `SupportedLocale`, `LanguageManager` |
| View state | `ViewState`, `WithViewState`, `ErrorView`, `CustomError` |
| Buttons | `AppButton.filled` / `AppButton.outlined`, `UnderlinedButton` |
| State | `Reactor`, `useReactor`, `useReactorState`, `useReactorEffect`, `useReactorListener`, `createReactorContext`, `ReactorObserver` |
| Dependency injection | `Container`, `createToken`, `DIProvider`, `DIScope`, `useResolve`, `Locator` |
| Preferences | `BasePreferences` with `userDefault` / `secure` / `inApp` fields, `usePreference`, `usePreferenceListener`, `MemoryStorage` |
| Security | `DeviceSecurityHelper`, `Rjsniffer` |

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

`ViewState` is a plain union with factories. `WithViewState` renders the right UI for the current state.

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

## Reactor: state, actions and effects

A `Reactor` holds one state and turns actions into new states. The view sees only `state` and `send`; fetching, rules and navigation decisions stay out of components. It is the React counterpart of a Flutter Bloc / SwiftUI TCA store, without a framework: about 250 lines on top of `useSyncExternalStore`.

```ts
type State = { viewState: ViewState; items: Product[] };
interface Action {                                   // action name -> payload (void = none)
  load: void;
  search: { query: string };
}
type Effect = { kind: 'toast'; message: string };    // one-shot, never stored in state

class ProductsReactor extends Reactor<State, Action, Effect> {
  constructor(repo: ProductsRepository) {            // dependencies come in through the constructor
    super({ viewState: ViewState.loading, items: [] });

    this.on.load(async (_, { emit, effect }) => {
      const result = await repo.list();
      result.when({
        success: (items) => emit({ viewState: ViewState.loaded, items }),
        failure: () => effect({ kind: 'toast', message: 'Failed' }),
      });
    });

    // restartable: a new search cancels the previous one; its late emit() is ignored
    this.on.search(async ({ query }, ctx) => {
      await wait(300);
      if (ctx.isCancelled) return;
      const result = await repo.list(query);
      result.when({ success: (items) => ctx.emit((s) => ({ ...s, items })), failure: () => {} });
    }, { transformer: 'restartable' });
  }
}
```

Handler context: `state` (always current), `emit(next | updater)`, `effect(e)`, `isCancelled`, `listen(source, onData)` (subscribe to a socket or notifier; released on dispose or restart) and `send.action(...)`. Transformers per action type: `concurrent` (default), `sequential`, `restartable`, `droppable`. A handler that throws goes to `onError` (override it to map errors to state) and to `ReactorObserver`.

```tsx
export const { Provider: ProductsProvider, useReactor: useProductsReactor } =
  createReactorContext<ProductsReactor>('Products');

<ProductsProvider create={(c) => new ProductsReactor(c.resolve(ProductsRepositoryToken))}
                  start={(r) => r.send.load()}>
  <ProductsScreen />
</ProductsProvider>

function ProductsScreen() {
  const reactor = useProductsReactor();
  const [state, send] = useReactor(reactor);                      // or pass a selector (+ shallowEqual)
  useReactorEffect(reactor, (e) => showToast(e.message));         // one-shot effects
  return <WithViewState viewState={state.viewState} retryAction={() => send.load()}>...</WithViewState>;
}
```

The provider creates the reactor once, disposes it on unmount and survives StrictMode. `create` must be side-effect free (it can run twice in development); send the first action from `start`.

**Automatic tracking.** `useReactorTracked(reactor)` re-renders only when a property the component actually read changes, with no selector to write. Reads are recorded on each render, only leaves are compared (a new `user` object with the same `user.name` is not a change), arrays are tracked by length and items, and `Object.keys` / spread track the key list. Pass a part of the state to a `React.memo` child or a long-lived store through `unwrapTracked(value)`, because the tracked copy changes identity on every render. Use `useReactorTrackedState(source)` for any state source, and `useReactor` with a selector when you want explicit control. Handlers can merge a partial with `ctx.patch({ loading: false })`.

```tsx
const [state, send] = useReactorTracked(reactor);
return <Text>{state.user.name}</Text>; // not re-rendered by changes to other fields
```

**Composition.** A flow made of several reactors owns its children with `this.own(child)`: they are disposed with the parent, last owned first. The parent follows a child with `ctx.listen(child, ...)` (every reactor is subscribable) and drives it with `child.send.action()`. Only own what the reactor creates; a shared reactor (an app-wide session, say) belongs to its container, and followers only `listen` to it.

```ts
class KycReactor extends Reactor<KycState, KycAction> {
  readonly identity = this.own(new IdentityReactor());
  readonly address = this.own(new AddressReactor());
  constructor() {
    super(initialKycState);
    this.on.start((_, ctx) => {
      const update = () => ctx.emit(summarise(this.identity.state, this.address.state));
      ctx.listen(this.identity, update);
      ctx.listen(this.address, update);
    });
  }
}
```

**Errors.** Make failures part of the state, per action:

```ts
this.on.load(
  async (_, ctx) => { /* fetch, then ctx.emit(...) */ },
  {
    transformer: 'restartable',
    retry: { times: 2, delayMs: 300, backoff: true, shouldRetry: isNetworkError }, // re-runs when the handler throws
    onError: (error, ctx) => ctx.patch({ viewState: ViewState.error(error) }),      // after the retries
  },
);
```

Handlers that return a `Result` (the networking package) retry with `retryAsync(() => api.load(), { times: 2, until: (r) => r.isSuccess, isCancelled: () => ctx.isCancelled })`. An error with no `onError` goes to the reactor's `onError` (log by default). Every error also reaches `ReactorObserver.onError`, so one observer can feed crash reporting. `singleFlight(fn)` makes concurrent calls share one run, which is what a token refresh needs when several requests get a 401 together.

**Lifetime.** A reactor lives exactly as long as what mounts it:

| Where | Lifetime |
| --- | --- |
| `Provider create` inside a screen | the screen: created on push, disposed on pop (Expo Router, React Navigation) |
| `Provider reactor={shared}` | not owned: whoever created it disposes it |
| Container singleton + `Locator` | the app (session, preferences) |
| `DIScope` | a flow (a checkout, a KYC wizard) |

Screens that stay mounted behind others (tabs) keep their reactors; pause work with `useFocusEffect` and `send` an action.

**Persistence.** `persistReactor(reactor, storage, { key, version, pick, migrate, debounceMs })` saves part of a state and `await persistence.restore()` loads it back through `reactor.hydrate(state)`. Bad or old data is migrated or dropped, storage errors go to `onError` and never reach the reactor. Keep tokens out of it (secure storage).

**Devtools.** `const history = new ReactorHistory(); history.attach()` keeps a bounded log of every action, transition and error. `history.transitions(reactor)` lists the states, `history.travel(reactor, 2)` puts the reactor back to an earlier state, and `JSON.stringify(history)` is ready to attach to a bug report. `combineObservers(a, b)` runs several observers as one.

Test without React: `new ProductsReactor(fakeRepo)`, `await r.send.load()`, then assert `r.state`. `recordStates`, `recordEffects` and `waitForState` help with streams. `ReactorObserver.current = consoleReactorObserver` logs every action, transition and error.

## Dependency injection

Typed tokens, explicit lifetimes, disposal, scopes.

```ts
const Api = createToken<Api>('Api');

const container = new Container()
  .registerValue(Config, config)
  .register(Api, (c) => new HttpApi(c.resolve(Config)))                  // singleton (default)
  .register(Feed, (c) => new SocketFeed(c.resolve(Config)), { lifetime: 'scoped' });

<DIProvider container={container}><App /></DIProvider>
const api = useResolve(Api);
```

- `singleton`: one per container (and its scopes). `scoped`: one per scope. `transient`: new each time, not tracked.
- `<DIScope>` (or `container.createScope()`) makes a child container; scoped objects are disposed with it (calls `dispose()` / `close()`, or the `dispose` option), so a socket can live exactly as long as a screen.
- A scope may re-register a token to override its parent, which is how tests swap fakes in.
- `Locator.setup(container)` once at startup, then `Locator.get(Token)` anywhere (notification handlers, deep links, background tasks), the global-accessor counterpart of GetIt in Flutter. Prefer `useResolve` in components: it respects scopes and overrides. `Locator.reset()` for tests / logout, `Locator.isReady` to check.
- Circular dependencies throw with the chain (`A -> B -> A`); resolving a missing token names it.

## Environment values (`bm-react-native-env`)

Generates an obfuscated TypeScript module from a `.env` file, the equivalent of Flutter's `envied` with `obfuscate: true`. Values are XOR-encoded with a fresh random key, so hosts and URLs never appear as plain text in the bundle.

```sh
# .env                          API_HOST=api.example.com
npx bm-react-native-env         # writes src/core/env.g.ts
```

```ts
import { Env } from './core/env.g';
Env.API_HOST;                   // "api.example.com"
```

**Several environments:** pass a mode (`--mode staging`, or `APP_ENV=staging`) and the files are layered, later ones overriding earlier ones: `.env` (shared), `.env.staging`, `.env.local` (your machine), `.env.staging.local`. Missing layers are skipped, so `development` can be just the base. `--env <file>` / `APP_ENV_FILE` reads exactly one file instead.

```sh
APP_ENV=staging npx expo start       # Metro regenerates env.g.ts from .env + .env.staging
npx bm-react-native-env --mode production
```

Options: `--mode <name>` (default `APP_ENV`), `--env <file>` (default `APP_ENV_FILE`), `--out <file>` (default `src/core/env.g.ts`), `--example <file>` (used when the env file is missing, default `.env.example`), `--name <Export>` (default `Env`). Git-ignore `.env` and the generated file, commit `.env.example`.

Run it again whenever `.env` changes: from `postinstall`, from `metro.config.js`, and as a Jest `globalSetup`:

```js
// metro.config.js / jest globalSetup
require('bm-react-native/scripts/bm-env').generate();   // same options as the CLI, plus { cwd }
```

This is obfuscation, not encryption: the app decodes the values at runtime, so a determined attacker can too. Keep real secrets on a server. The tool is Node-only and is not part of the React Native entry point.

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

`npm test` (Jest, `react-test-renderer`). The native Android / iOS code has not been compiled in this repository; verify it in an app build before releasing.

## Example app

The Reactor and DI modules are demonstrated end to end (REST, a live WebSocket, scopes, tests with fakes) in `BMReactorDemo`, next to this package.

`example/` is an Expo app (dev client, not Expo Go) that exercises every helper and links the native sniffer:

```bash
cd example && npm install --legacy-peer-deps
npx expo run:ios      # or run:android; then: npm start
npm run typecheck
```
