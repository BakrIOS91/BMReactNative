import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import {
  AppButton,
  DeviceHelper,
  DeviceRegistry,
  DeviceSecurityHelper,
  ErrorView,
  FontKey,
  FontRegistry,
  LanguageManager,
  SecurityCheckResult,
  UnderlinedButton,
  usePreference,
  usePreferenceListener,
  useFontStyle,
  useScaleValue,
  useScalingFactor,
  ViewState,
  WithViewState,
} from 'bm-react-native';
import { prefs } from './src/preferences';

// System fonts so the example needs no font assets.
FontRegistry.registerFont(FontKey.primary, 'Helvetica');
FontRegistry.registerFont(FontKey.secondary, 'Courier');
DeviceRegistry.registerReferenceWidth(390);

class Lang extends LanguageManager {}

const bold = { weightValue: 700 };
const states: [string, ViewState][] = [
  ['loaded', ViewState.loaded],
  ['loading', ViewState.loading],
  ['noNetwork', ViewState.noNetwork()],
  ['noData', ViewState.noData()],
  ['serverError', ViewState.serverError()],
  ['custom', ViewState.customError({ title: 'Custom', message: 'Fully customisable' })],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const font = useFontStyle();
  const scale = useScaleValue();
  return (
    <View style={{ marginBottom: scale(20) }}>
      <Text style={[font({ size: 18, weight: bold }), { marginBottom: scale(8) }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function App() {
  const font = useFontStyle();
  const scale = useScaleValue();
  const factor = useScalingFactor();
  const theme = usePreference(prefs.themeMode);
  const launches = usePreference(prefs.launchCount);
  const token = usePreference(prefs.token);
  const [ready, setReady] = useState(false);
  const [viewState, setViewState] = useState<ViewState>(ViewState.loaded);
  const [mode, setMode] = useState<'replace' | 'bottomSheet'>('replace');
  const [security, setSecurity] = useState<SecurityCheckResult | string>('checking…');
  const [log, setLog] = useState<string[]>([]);

  usePreferenceListener(prefs.token, (t) => setLog((l) => [`token → ${t ?? 'null'}`, ...l].slice(0, 3)));

  useEffect(() => {
    prefs.init().then(() => {
      prefs.launchCount.value += 1;
      setReady(true);
    });
    DeviceSecurityHelper.checkDeviceSecurity({ checkEmulator: false }).then(setSecurity, (e) => setSecurity(String(e)));
  }, []);

  if (!ready) return null;
  const dark = theme === 'dark';
  const fg = dark ? '#fff' : '#111';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#111' : '#f4f4f6' }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ padding: scale(16) }}>
        <Text style={[font({ size: 28, weight: bold, color: fg })]}>BMReactNative</Text>

        <Section title="Scaling & fonts">
          <Text style={font({ size: 14, color: fg })}>
            scale {factor.toFixed(2)} · {JSON.stringify(DeviceHelper.getScalingFactor({ width: 320, height: 640 }))} @320 ·
            locale {JSON.stringify(new Lang().resolve({ languageCode: 'ar', countryCode: 'EG' }))}
          </Text>
          <Text style={font({ size: 14, color: fg, fontKey: FontKey.secondary, lineHeight: 1.4 })}>Secondary font, lineHeight 1.4</Text>
        </Section>

        <Section title="Preferences">
          <Text style={font({ color: fg })}>theme: {theme} · launches: {launches} · token: {token ?? 'null'}</Text>
          <AppButton.filled title="Toggle theme (persisted)" backgroundColor="#0a84ff" titleStyle={font({ color: '#fff', weight: bold })} onPress={() => (prefs.themeMode.value = dark ? 'light' : 'dark')} />
          <View style={{ height: scale(8) }} />
          <AppButton.outlined title={token ? 'Clear secure token' : 'Set secure token'} borderColor="#0a84ff" titleStyle={font({ color: '#0a84ff' })} onPress={() => (prefs.token.value = token ? null : 'jwt_123')} />
          {log.map((l, i) => <Text key={i} style={font({ size: 12, color: fg })}>{l}</Text>)}
        </Section>

        <Section title="Buttons">
          <AppButton.filled title="Disabled" isDisabled titleStyle={font({ color: '#000' })} />
          <View style={{ height: scale(8) }} />
          <AppButton.outlined title="Trailing icon" icon={<Text>→</Text>} iconPosition="trailing" labelPosition="leading" borderColor={fg} titleStyle={font({ color: fg })} />
          <UnderlinedButton title="Forgot password?" color="#0a84ff" onPress={() => setViewState(ViewState.unauthorized())} />
        </Section>

        <Section title="Device security">
          <Text style={font({ size: 13, color: fg })}>
            {typeof security === 'string' ? security : `${security.isSecure ? '✅' : '⚠️'} ${security.reason}`}
          </Text>
        </Section>

        <Section title="WithViewState">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(6) }}>
            {states.map(([name, s]) => (
              <UnderlinedButton key={name} title={name} color="#0a84ff" onPress={() => setViewState(s)} />
            ))}
            <UnderlinedButton title={`mode: ${mode}`} color="#ff9f0a" onPress={() => setMode((m) => (m === 'replace' ? 'bottomSheet' : 'replace'))} />
          </View>
          <View style={{ height: scale(220), marginTop: scale(8), borderRadius: scale(12), overflow: 'hidden', backgroundColor: '#fff' }}>
            <WithViewState viewState={viewState} errorDisplayMode={mode} retryAction={() => setViewState(ViewState.loaded)}>
              <ErrorView title="Content" message="Loaded content lives here" image={null} />
            </WithViewState>
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
