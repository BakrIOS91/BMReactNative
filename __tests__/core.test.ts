import { DeviceHelper, DeviceRegistry } from '../src/helpers/device-helper';
import { FontHelper, FontKey, FontRegistry } from '../src/design/font-helper';
import { toFontWeight } from '../src/design/font-weight';
import { LanguageManager } from '../src/helpers/language-manager';
import { SupportedLocale, toLocale, localeTag } from '../src/helpers/enums';
import { ViewState } from '../src/helpers/view-state';
import { CustomError } from '../src/helpers/custom-error';
import { ValueNotifier } from '../src/helpers/observable';

afterEach(() => {
  DeviceRegistry.reset();
  FontRegistry.clear();
});

describe('DeviceHelper', () => {
  it('scales by width relative to 440 and clamps to [0.9, 1.1]', () => {
    expect(DeviceHelper.getScalingFactor({ width: 440, height: 900 })).toBe(1);
    expect(DeviceHelper.getScalingFactor({ width: 320, height: 640 })).toBe(0.9);
    expect(DeviceHelper.getScalingFactor({ width: 500, height: 900 })).toBe(1.1);
  });
  it('uses 1.5 on tablets', () => {
    expect(DeviceHelper.getScalingFactor({ width: 800, height: 1200 })).toBe(1.5);
  });
  it('honours a registered reference width', () => {
    DeviceRegistry.registerReferenceWidth(400);
    expect(DeviceRegistry.referenceWidth).toBe(400);
    expect(DeviceHelper.getScalingFactor({ width: 420, height: 800 })).toBeCloseTo(1.05);
  });
});

describe('fonts', () => {
  it('maps weights and clamps', () => {
    expect(toFontWeight({ weightValue: 600 })).toBe('600');
    expect(toFontWeight({ weightValue: 50 })).toBe('100');
    expect(toFontWeight({ weightValue: 1200 })).toBe('900');
  });
  it('throws for an unregistered key', () => {
    expect(() => FontHelper.style({ width: 440, height: 900 })).toThrow('Font for key "primary" is not registered!');
  });
  it('builds a scaled style', () => {
    FontRegistry.registerFont(FontKey.primary, 'Cairo');
    FontRegistry.registerFont(FontKey.custom('brand'), 'Brand');
    const s = FontHelper.style({ width: 500, height: 900 }, { size: 20, weight: { weightValue: 700 }, color: '#f00', lineHeight: 1.5 });
    expect(s).toEqual({ fontFamily: 'Cairo', fontSize: 22, fontWeight: '700', color: '#f00', lineHeight: 33 });
    expect(FontHelper.style({ width: 440, height: 900 }, { fontKey: FontKey.custom('brand') })).toMatchObject({ fontFamily: 'Brand', fontSize: 14, fontWeight: '400', color: '#000000' });
  });
});

describe('LanguageManager', () => {
  class M extends LanguageManager {}
  const m = new M();
  it('resolves', () => {
    expect(m.resolve(null)).toEqual({ languageCode: 'en', countryCode: 'US' });
    expect(m.resolve({ languageCode: 'ar', countryCode: 'EG' })).toEqual({ languageCode: 'ar' });
    expect(m.resolve({ languageCode: 'fr', countryCode: 'BE' })).toEqual({ languageCode: 'fr' });
    expect(m.resolve({ languageCode: 'xx' })).toEqual(m.fallbackLocale);
  });
  it('honours overrides', () => {
    class Only extends LanguageManager {
      get supported() { return [SupportedLocale.enUs, SupportedLocale.arEG]; }
    }
    expect(new Only().supportedLocales).toHaveLength(2);
    expect(new Only().resolve({ languageCode: 'fr' })).toEqual(new Only().fallbackLocale);
  });
  it('parses locales', () => {
    expect(toLocale('ar_EG')).toEqual({ languageCode: 'ar', countryCode: 'EG' });
    expect(localeTag(toLocale('ar_EG'))).toBe('ar-EG');
    expect(localeTag(toLocale('de'))).toBe('de');
  });
});

describe('ViewState & CustomError', () => {
  it('flags errors', () => {
    expect(ViewState.loading.isError).toBe(false);
    expect(ViewState.loaded.isError).toBe(false);
    expect(ViewState.overlayLoading()).toMatchObject({ color: 'transparent', isError: false });
    for (const make of [ViewState.noNetwork, ViewState.noData, ViewState.serverError, ViewState.unexpectedError, ViewState.unauthorized, ViewState.forceUpdate, ViewState.jailBroken, ViewState.searchError]) {
      expect(make({ errorModel: 1 })).toMatchObject({ isError: true, errorModel: 1 });
      expect(make().isError).toBe(true);
    }
    expect(ViewState.customError()).toMatchObject({ title: '', buttonText: '', isError: true });
    expect(ViewState.customError({ title: 't' })).toMatchObject({ title: 't' });
  });
  it('compares custom errors by button title', () => {
    const a = new CustomError(1, 't', 'm', 'Retry');
    expect(a.equals(new CustomError(2, 'x', 'y', 'Retry'))).toBe(true);
    expect(a.equals(new CustomError(1, 't', 'm', 'Other'))).toBe(false);
    expect(a.equals({})).toBe(false);
  });
});

describe('ValueNotifier', () => {
  it('notifies on change only', () => {
    const n = new ValueNotifier(1);
    const fn = jest.fn();
    const off = n.subscribe(fn);
    n.value = 1;
    n.value = 2;
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    n.value = 3;
    expect(fn).toHaveBeenCalledTimes(1);
    n.subscribe(fn);
    n.dispose();
    n.value = 4;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
