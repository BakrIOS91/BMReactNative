import type { TextStyle } from 'react-native';
import { DeviceHelper, ScreenSize } from '../helpers/device-helper';
import { defaultFontWeight, FontWeightProtocol, toFontWeight } from './font-weight';

/** Type-safe key for a font family: the predefined `primary` / `secondary`, or `FontKey.custom('x')`. */
export class FontKey {
  static readonly primary = new FontKey('primary');
  static readonly secondary = new FontKey('secondary');

  private constructor(readonly key: string) {}

  static custom(key: string): FontKey {
    return new FontKey(key);
  }
}

/**
 * Maps font keys to the font family names the host app has loaded. Register
 * once at startup; looking up a missing key throws instead of silently falling
 * back to the system font.
 */
export class FontRegistry {
  private static fonts = new Map<string, string>();

  static registerFont(key: FontKey, fontFamily: string): void {
    FontRegistry.fonts.set(key.key, fontFamily);
  }

  static getFont(key: FontKey): string {
    const font = FontRegistry.fonts.get(key.key);
    if (font === undefined) {
      throw new Error(`Font for key "${key.key}" is not registered!`);
    }
    return font;
  }

  static clear(): void {
    FontRegistry.fonts.clear();
  }
}

export interface FontStyleOptions {
  /** Base size before scaling. Default 14. */
  size?: number;
  /** Default regular (400). */
  weight?: FontWeightProtocol;
  /** Default black. */
  color?: string;
  /** Line height multiplier relative to the font size (1.4 suits body text). */
  lineHeight?: number;
  /** Default `FontKey.primary`. */
  fontKey?: FontKey;
}

export class FontHelper {
  /**
   * Builds a `TextStyle` whose size is already scaled by [DeviceHelper]; do not
   * scale font sizes again. [screen] is the current window size, which
   * `useFontStyle` supplies for you inside components.
   */
  static style(screen: ScreenSize, options: FontStyleOptions = {}): TextStyle {
    const {
      size = 14,
      weight = defaultFontWeight,
      color = '#000000',
      lineHeight,
      fontKey = FontKey.primary,
    } = options;
    const scale = DeviceHelper.getScalingFactor(screen);
    const fontSize = size * scale;
    return {
      fontFamily: FontRegistry.getFont(fontKey),
      fontSize,
      fontWeight: toFontWeight(weight),
      color,
      // React Native line height is absolute, so derive it from the scaled size.
      ...(lineHeight === undefined ? {} : { lineHeight: lineHeight * fontSize }),
    };
  }
}
