import TestRenderer, { act } from 'react-test-renderer';
import { BasePreferences } from '../src/helpers/preferences/base-preferences';
import { MemoryStorage, PreferencesStorage } from '../src/helpers/preferences/storage';
import { usePreference, usePreferenceListener } from '../src/reusable/use-preference';

class Prefs extends BasePreferences {
  theme = this.userDefault('theme', 'light');
  token = this.secure<string | null>('token', null);
  temp = this.inApp(false);
  model = this.userDefault('model', { n: 1 }, { encode: (v) => `n=${v.n}`, decode: (r) => ({ n: Number(r.slice(2)) }) });
}

function setup(over: Partial<ConstructorParameters<typeof BasePreferences>[0]> = {}) {
  const storage = new MemoryStorage();
  const secureStorage = new MemoryStorage();
  return { storage, secureStorage, prefs: new Prefs({ storage, secureStorage, ...over }) };
}

it('persists, reloads and deletes secure values on null', async () => {
  const { storage, secureStorage, prefs } = setup();
  await prefs.init();
  expect(prefs.theme.value).toBe('light');
  prefs.theme.value = 'dark';
  prefs.token.value = 'jwt';
  prefs.temp.value = true;
  prefs.model.value = { n: 5 };
  await prefs.flush();
  expect(await storage.getItem('theme')).toBe('"dark"');
  expect(await storage.getItem('model')).toBe('n=5');
  expect(await secureStorage.getItem('token')).toBe('"jwt"');

  const again = new Prefs({ storage, secureStorage });
  await again.init();
  expect(again.theme.value).toBe('dark');
  expect(again.token.value).toBe('jwt');
  expect(again.temp.value).toBe(false);
  expect(again.model.value).toEqual({ n: 5 });

  prefs.token.value = null;
  await prefs.flush();
  expect(await secureStorage.getItem('token')).toBeNull();
  prefs.dispose();
});

it('keeps the default for corrupted values and reports write errors', async () => {
  const { storage, prefs } = setup();
  await storage.setItem('theme', '{not json');
  await storage.setItem('model', '');
  await prefs.init();
  expect(prefs.theme.value).toBe('light');
  expect(prefs.model.value).toEqual({ n: 1 });

  const onPersistError = jest.fn();
  const failing: PreferencesStorage = { ...new MemoryStorage(), getItem: async () => null, setItem: async () => { throw new Error('boom'); }, removeItem: async () => {} };
  const p = new Prefs({ storage: failing, secureStorage: failing, onPersistError });
  await p.init();
  p.theme.value = 'x';
  await p.flush();
  expect(onPersistError).toHaveBeenCalledWith(expect.any(Error), 'theme');
});

it('does not throw on write errors without a handler', async () => {
  const failing: PreferencesStorage = { getItem: async () => null, setItem: async () => { throw new Error('x'); }, removeItem: async () => {} };
  const p = new Prefs({ storage: failing, secureStorage: failing });
  p.theme.value = 'x';
  await expect(p.flush()).resolves.toBeUndefined();
});

it('defaults to the optional native adapters and explains when missing', async () => {
  const p = new Prefs();
  await expect(p.init()).rejects.toThrow('is not installed');
});

it('hooks follow the preference', async () => {
  const { prefs } = setup();
  const seen: string[] = [];
  const logged: string[] = [];
  function C() {
    seen.push(usePreference(prefs.theme));
    usePreferenceListener(prefs.theme, (v) => logged.push(v), (prev, cur) => prev !== cur && cur !== 'skip');
    return null;
  }
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<C />); });
  await act(async () => { prefs.theme.value = 'dark'; });
  await act(async () => { prefs.theme.value = 'skip'; });
  expect(seen).toContain('dark');
  expect(logged).toEqual(['dark']);
  act(() => r.unmount());
});

it('listener fires without a listenWhen filter', async () => {
  const { prefs } = setup();
  const logged: string[] = [];
  function C() { usePreferenceListener(prefs.theme, (v) => logged.push(v)); return null; }
  await act(async () => { TestRenderer.create(<C />); });
  await act(async () => { prefs.theme.value = 'a'; });
  expect(logged).toEqual(['a']);
});
