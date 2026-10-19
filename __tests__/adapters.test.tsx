import TestRenderer, { act } from 'react-test-renderer';
import { mockWindow } from './mocks/react-native';
import { asyncStorageAdapter, secureStoreAdapter } from '../src/helpers/preferences/storage';
import { useScaleValue, useScalingFactor } from '../src/helpers/device-helper';
import { useFontStyle } from '../src/design/use-font-style';
import { FontKey, FontRegistry } from '../src/design/font-helper';

const asyncMock = { getItem: jest.fn(async () => 'v'), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) };
const secureMock = { getItemAsync: jest.fn(async () => 's'), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) };
jest.mock('@react-native-async-storage/async-storage', () => ({ default: asyncMock }), { virtual: true });
jest.mock('expo-secure-store', () => secureMock, { virtual: true });

it('wraps AsyncStorage', async () => {
  const s = asyncStorageAdapter();
  expect(await s.getItem('k')).toBe('v');
  await s.setItem('k', 'x');
  await s.removeItem('k');
  expect(asyncMock.setItem).toHaveBeenCalledWith('k', 'x');
  expect(asyncMock.removeItem).toHaveBeenCalledWith('k');
});

it('wraps expo-secure-store', async () => {
  const s = secureStoreAdapter();
  expect(await s.getItem('k')).toBe('s');
  await s.setItem('k', 'x');
  await s.removeItem('k');
  expect(secureMock.setItemAsync).toHaveBeenCalledWith('k', 'x');
  expect(secureMock.deleteItemAsync).toHaveBeenCalledWith('k');
});

it('hooks follow the window size', () => {
  FontRegistry.registerFont(FontKey.primary, 'Cairo');
  mockWindow.width = 484;
  let out: any;
  function C() {
    out = { f: useScalingFactor(), v: useScaleValue()(10), s: useFontStyle()({ size: 10 }) };
    return null;
  }
  act(() => { TestRenderer.create(<C />); });
  expect(out.f).toBeCloseTo(1.1);
  expect(out.v).toBeCloseTo(11);
  expect(out.s).toMatchObject({ fontFamily: 'Cairo', fontSize: expect.closeTo(11) });
  mockWindow.width = 440;
  FontRegistry.clear();
});
